/**
 * Vérifie l'idempotence du webhook CinetPay ET, surtout (correction 1), qu'un échec de
 * vérification (timeout/panne réseau) ne change JAMAIS le statut d'une PaymentAttempt.
 */

import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { prisma, newTrackedIds, cleanupTrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";
import { makeRequest } from "./helpers/auth";

vi.mock("@/lib/cinetpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cinetpay")>();
  return { ...actual, verifyCinetPayPayment: vi.fn() };
});

import { verifyCinetPayPayment } from "@/lib/cinetpay";

const ids = newTrackedIds();

async function seedPendingAttempt(amountFcfa: number) {
  const organizer = await createTestUser(ids, { roles: ["supplier"] });
  const buyer = await createTestUser(ids);
  const { cityId, categoryId } = await createTestCityAndCategory(ids);
  const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
  const ticketType = await createTestTicketType(event.id, { quantity: 5, priceFcfa: amountFcfa });

  const payment = await prisma.payment.create({
    data: {
      user_id: buyer.id, amount: amountFcfa, payment_method: "pending", status: "pending",
      booking_type: "event", booking_id: "placeholder", platform_fee: 0, supplier_amount: amountFcfa,
    },
    select: { id: true },
  });

  const booking = await prisma.eventBooking.create({
    data: {
      user_id: buyer.id, event_id: event.id, ticket_type_id: ticketType.id, quantity: 1,
      unit_price_fcfa: amountFcfa, subtotal_fcfa: amountFcfa, total_amount: amountFcfa, commission_fcfa: 0,
      status: "pending", qr_code: "pending", payment_id: payment.id,
    },
    select: { id: true },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { booking_id: booking.id } });

  const attempt = await prisma.paymentAttempt.create({
    data: { payment_id: payment.id, provider: "cinetpay", status: "pending", amount_fcfa: amountFcfa },
    select: { id: true },
  });

  return { paymentId: payment.id, bookingId: booking.id, attemptId: attempt.id };
}

describe("payments webhook", () => {
  afterEach(() => vi.mocked(verifyCinetPayPayment).mockReset());
  afterAll(async () => {
    await cleanupTrackedIds(ids);
    await prisma.$disconnect();
  });

  it("resolves exactly once under concurrent duplicate webhook calls", async () => {
    const { attemptId, bookingId } = await seedPendingAttempt(5_000);
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "completed", paymentMethod: "orange_money", amount: 5_000 });

    const [r1, r2] = await Promise.all([
      webhook(makeRequest("http://localhost/api/payments/webhook", { method: "POST", body: { cpm_trans_id: attemptId } })),
      webhook(makeRequest("http://localhost/api/payments/webhook", { method: "POST", body: { cpm_trans_id: attemptId } })),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("completed");

    const tickets = await prisma.eventTicket.findMany({ where: { booking_id: bookingId } });
    expect(tickets).toHaveLength(1);
  });

  it("never changes attempt status when provider verification throws (correction 1)", async () => {
    const { attemptId } = await seedPendingAttempt(5_000);
    vi.mocked(verifyCinetPayPayment).mockRejectedValue(new Error("simulated network timeout"));

    const res = await webhook(makeRequest("http://localhost/api/payments/webhook", { method: "POST", body: { cpm_trans_id: attemptId } }));
    expect(res.status).toBe(200); // le webhook accuse réception même si la vérification échoue

    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("pending"); // JAMAIS "failed"/"expired" sur une simple panne réseau
  });
});
