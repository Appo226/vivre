/**
 * Vérifie le cœur de la correction 1 : reconcileStalePayments() ne fabrique JAMAIS un état
 * terminal à partir du seul temps écoulé — uniquement d'une réponse authentique du provider.
 * Chaque test nettoie ses propres données pour que le balayage d'un test n'agisse jamais sur
 * les tentatives laissées par le test précédent.
 */

import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { reconcileStalePayments } from "@/lib/payments/orchestrator";
import { issueTicketsForBooking } from "@/lib/events";
import { prisma, newTrackedIds, cleanupTrackedIds, type TrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";

vi.mock("@/lib/cinetpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cinetpay")>();
  return { ...actual, verifyCinetPayPayment: vi.fn() };
});
vi.mock("@/lib/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...actual, notify: vi.fn() };
});

import { verifyCinetPayPayment } from "@/lib/cinetpay";
import { notify } from "@/lib/notifications";

let ids: TrackedIds;

async function seedAttempt(opts: { ageMinutes: number; amountFcfa?: number }) {
  const organizer = await createTestUser(ids, { roles: ["supplier"] });
  const buyer = await createTestUser(ids);
  const { cityId, categoryId } = await createTestCityAndCategory(ids);
  const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
  const ticketType = await createTestTicketType(event.id, { quantity: 5, priceFcfa: opts.amountFcfa ?? 5_000 });

  const payment = await prisma.payment.create({
    data: {
      user_id: buyer.id, amount: opts.amountFcfa ?? 5_000, payment_method: "pending", status: "pending",
      booking_type: "event", booking_id: "placeholder", platform_fee: 0, supplier_amount: opts.amountFcfa ?? 5_000,
    },
    select: { id: true },
  });
  const booking = await prisma.eventBooking.create({
    data: {
      user_id: buyer.id, event_id: event.id, ticket_type_id: ticketType.id, quantity: 1,
      unit_price_fcfa: opts.amountFcfa ?? 5_000, subtotal_fcfa: opts.amountFcfa ?? 5_000,
      total_amount: opts.amountFcfa ?? 5_000, commission_fcfa: 0,
      status: "pending", qr_code: "pending", payment_id: payment.id,
    },
    select: { id: true },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { booking_id: booking.id } });

  const initiatedAt = new Date(Date.now() - opts.ageMinutes * 60 * 1000);
  const attempt = await prisma.paymentAttempt.create({
    data: {
      payment_id: payment.id, provider: "cinetpay", status: "pending",
      amount_fcfa: opts.amountFcfa ?? 5_000, initiated_at: initiatedAt,
    },
    select: { id: true },
  });

  return { paymentId: payment.id, bookingId: booking.id, attemptId: attempt.id };
}

describe("reconcileStalePayments", () => {
  afterEach(async () => {
    await cleanupTrackedIds(ids);
    vi.mocked(verifyCinetPayPayment).mockReset();
    vi.mocked(notify).mockReset();
  });
  afterAll(() => prisma.$disconnect());

  it("resolves completed on an authentic 'completed' answer past the recheck window", async () => {
    ids = newTrackedIds();
    const { attemptId, bookingId } = await seedAttempt({ ageMinutes: 40 });
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "completed", paymentMethod: "orange_money", amount: 5_000 });

    const result = await reconcileStalePayments();
    expect(result.resolvedCompleted).toBe(1);

    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("completed");
    const tickets = await prisma.eventTicket.findMany({ where: { booking_id: bookingId } });
    expect(tickets).toHaveLength(1);
  });

  it("resolves failed on an authentic 'failed' answer", async () => {
    ids = newTrackedIds();
    const { attemptId } = await seedAttempt({ ageMinutes: 40 });
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "failed", paymentMethod: null, amount: null });

    const result = await reconcileStalePayments();
    expect(result.resolvedFailed).toBe(1);
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("failed");
  });

  it("NEVER changes status on an authentic 'pending' answer", async () => {
    ids = newTrackedIds();
    const { attemptId } = await seedAttempt({ ageMinutes: 40 });
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "pending", paymentMethod: null, amount: null });

    const result = await reconcileStalePayments();
    expect(result.stillPending).toBe(1);
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("pending");
  });

  it("CORRECTION 1 — never changes status when verify() itself throws (network/timeout)", async () => {
    ids = newTrackedIds();
    const { attemptId } = await seedAttempt({ ageMinutes: 40 });
    vi.mocked(verifyCinetPayPayment).mockRejectedValue(new Error("simulated outage"));

    const result = await reconcileStalePayments();
    expect(result.verificationErrors).toBe(1);
    expect(result.resolvedFailed).toBe(0);
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("pending"); // toujours pas "failed"/"expired"
  });

  it("flags a stuck attempt for review exactly once, never re-notifies on a later run", async () => {
    ids = newTrackedIds();
    await createTestUser(ids, { roles: ["admin"] }); // flagPaymentAttemptForReview notifie tous les admins
    const { attemptId } = await seedAttempt({ ageMinutes: 25 * 60 }); // 25h > seuil de 24h
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "pending", paymentMethod: null, amount: null });

    const first = await reconcileStalePayments();
    expect(first.flaggedForReview).toBe(1);
    const afterFirst = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(afterFirst.flagged_for_review_at).not.toBeNull();
    expect(afterFirst.status).toBe("pending"); // signalé, PAS terminalisé

    const second = await reconcileStalePayments();
    expect(second.flaggedForReview).toBe(0); // jamais re-signalé
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1); // jamais re-notifié
  });

  it("flags double-completion instead of silently re-applying the business effect", async () => {
    ids = newTrackedIds();
    const { attemptId: firstAttemptId, paymentId, bookingId } = await seedAttempt({ ageMinutes: 40 });

    // Première tentative déjà complétée ET son billet déjà émis (simulé directement, hors
    // reconciliation) — sans ce billet déjà présent, le balayage d'auto-réparation
    // "ticketsRepaired" (Payment completed + booking confirmed + zéro billet) émettrait lui
    // aussi un billet dans la même passe de reconcileStalePayments(), pour une raison
    // légitime mais différente de ce que ce test vérifie précisément.
    await prisma.paymentAttempt.update({ where: { id: firstAttemptId }, data: { status: "completed", resolved_at: new Date() } });
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "completed" } });
    await prisma.eventBooking.update({ where: { id: bookingId }, data: { status: "confirmed" } });
    await issueTicketsForBooking(bookingId);

    // Deuxième tentative sur le MÊME Payment, plus vieille que le seuil, qui vérifie authentique "completed" elle aussi.
    const secondAttempt = await prisma.paymentAttempt.create({
      data: { payment_id: paymentId, provider: "cinetpay", status: "pending", amount_fcfa: 5_000, initiated_at: new Date(Date.now() - 40 * 60 * 1000) },
      select: { id: true },
    });
    vi.mocked(verifyCinetPayPayment).mockResolvedValue({ status: "completed", paymentMethod: "moov", amount: 5_000 });

    const result = await reconcileStalePayments();
    expect(result.doubleCompletionFlags).toBe(1);

    const flagged = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: secondAttempt.id } });
    expect(flagged.status).toBe("completed"); // enregistré fidèlement...
    expect(flagged.flagged_for_review_at).not.toBeNull(); // ...mais signalé, pas silencieusement accepté

    const tickets = await prisma.eventTicket.count({ where: { booking_id: bookingId } });
    expect(tickets).toBe(1); // toujours 1 — l'effet métier n'a PAS été réappliqué une seconde fois
  });

  it("self-heals a manual-bridge booking stuck confirmed with zero tickets", async () => {
    ids = newTrackedIds();
    const organizer = await createTestUser(ids, { roles: ["supplier"] });
    const buyer = await createTestUser(ids);
    const { cityId, categoryId } = await createTestCityAndCategory(ids);
    const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
    const ticketType = await createTestTicketType(event.id, { quantity: 5 });

    const payment = await prisma.payment.create({
      data: { user_id: buyer.id, amount: 5_000, payment_method: "manual_mobile_money", status: "completed",
        booking_type: "event", booking_id: "placeholder", platform_fee: 0, supplier_amount: 5_000 },
      select: { id: true },
    });
    const booking = await prisma.eventBooking.create({
      data: { user_id: buyer.id, event_id: event.id, ticket_type_id: ticketType.id, quantity: 1,
        unit_price_fcfa: 5_000, subtotal_fcfa: 5_000, total_amount: 5_000, commission_fcfa: 0,
        status: "confirmed", qr_code: "pending", payment_id: payment.id },
      select: { id: true },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { booking_id: booking.id } });

    const result = await reconcileStalePayments();
    expect(result.ticketsRepaired).toBe(1);
    const tickets = await prisma.eventTicket.findMany({ where: { booking_id: booking.id } });
    expect(tickets).toHaveLength(1);
  });
});
