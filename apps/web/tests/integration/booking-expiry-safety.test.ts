/**
 * Vérifie le tableau d'états de correction 2 : expireStalePendingBookings() ne peut JAMAIS
 * produire "acheteur payé + commande annulée + inventaire revendu" — chaque branche
 * d'annulation exige une preuve définitive, jamais une simple absence de réponse.
 */

import { describe, it, expect, afterEach, afterAll } from "vitest";
import { expireStalePendingBookings } from "@/lib/events";
import { prisma, newTrackedIds, cleanupTrackedIds, type TrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";

let ids: TrackedIds;

async function seedPendingBooking(opts: {
  ageMinutes: number;
  withPayment: boolean;
  paymentStatus?: "pending" | "completed" | "failed";
  activeAttempt?: boolean;
}) {
  const organizer = await createTestUser(ids, { roles: ["supplier"] });
  const buyer = await createTestUser(ids);
  const { cityId, categoryId } = await createTestCityAndCategory(ids);
  const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
  const ticketType = await createTestTicketType(event.id, { quantity: 5, priceFcfa: 5_000 });

  let paymentId: string | null = null;
  if (opts.withPayment) {
    const payment = await prisma.payment.create({
      data: {
        user_id: buyer.id, amount: 5_000, payment_method: "pending",
        status: opts.paymentStatus ?? "pending", booking_type: "event", booking_id: "placeholder",
        platform_fee: 0, supplier_amount: 5_000,
      },
      select: { id: true },
    });
    paymentId = payment.id;

    if (opts.activeAttempt) {
      await prisma.paymentAttempt.create({
        data: { payment_id: payment.id, provider: "cinetpay", status: "pending", amount_fcfa: 5_000 },
      });
    } else {
      await prisma.paymentAttempt.create({
        data: { payment_id: payment.id, provider: "cinetpay", status: "failed", amount_fcfa: 5_000, resolved_at: new Date() },
      });
    }
  }

  const createdAt = new Date(Date.now() - opts.ageMinutes * 60 * 1000);
  const booking = await prisma.eventBooking.create({
    data: {
      user_id: buyer.id, event_id: event.id, ticket_type_id: ticketType.id, quantity: 1,
      unit_price_fcfa: 5_000, subtotal_fcfa: 5_000, total_amount: 5_000, commission_fcfa: 0,
      status: "pending", qr_code: "pending", created_at: createdAt,
      ...(paymentId && { payment_id: paymentId }),
    },
    select: { id: true },
  });
  if (paymentId) {
    await prisma.payment.update({ where: { id: paymentId }, data: { booking_id: booking.id } });
  }

  return booking.id;
}

describe("expireStalePendingBookings state machine", () => {
  afterEach(() => cleanupTrackedIds(ids));
  afterAll(() => prisma.$disconnect());

  it("expires a booking that never attempted payment at all", async () => {
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 40, withPayment: false });

    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(1);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("cancelled");
  });

  it("expires a booking whose only payment attempt definitively failed", async () => {
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 40, withPayment: true, paymentStatus: "pending", activeAttempt: false });

    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(1);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("cancelled");
  });

  it("NEVER expires a booking with an active/unresolved payment attempt", async () => {
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 40, withPayment: true, paymentStatus: "pending", activeAttempt: true });

    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(0);
    expect(result.skippedActivePayment).toBe(1);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("pending"); // toujours en attente — inventaire toujours retenu
  });

  it("ADVERSARIAL — safety holds even if payment reconciliation was never run first", async () => {
    // Simule l'invariant d'ordre du cron JAMAIS respecté (violation hypothétique) — la
    // protection doit tenir uniquement grâce à la vérification "tentative active", pas grâce
    // à l'ordre d'exécution.
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 40, withPayment: true, paymentStatus: "pending", activeAttempt: true });

    // Pas d'appel à reconcileStalePayments() ici, volontairement.
    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(0);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("pending");
  });

  it("flags the anomaly branch instead of touching a booking whose payment is already completed", async () => {
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 40, withPayment: true, paymentStatus: "completed", activeAttempt: false });

    const result = await expireStalePendingBookings();
    expect(result.expired).toBe(0);
    expect(result.skippedAnomaly).toBe(1);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("pending"); // ni annulée ni modifiée — juste signalée
  });

  it("does not touch a booking younger than the reservation TTL", async () => {
    ids = newTrackedIds();
    const bookingId = await seedPendingBooking({ ageMinutes: 5, withPayment: false });

    const result = await expireStalePendingBookings();
    expect(result.candidatesChecked).toBe(0);
    const booking = await prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("pending");
  });
});
