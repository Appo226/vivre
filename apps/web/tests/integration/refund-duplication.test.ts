/**
 * Vérifie qu'aucun des deux chemins de remboursement (annulation de billet, remboursement de
 * frais de mise en ligne) ne peut créer un doublon, même en cas d'appels concurrents.
 */

import { describe, it, expect, afterAll } from "vitest";
import { cancelTickets, issueTicketsForBooking, refundEventListingPayment } from "@/lib/events";
import { prisma, newTrackedIds, cleanupTrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";

const ids = newTrackedIds();

describe("refund duplication protection", () => {
  afterAll(async () => {
    await cleanupTrackedIds(ids);
    await prisma.$disconnect();
  });

  it("never creates two refunds for the same cancelled ticket under concurrent calls", async () => {
    const organizer = await createTestUser(ids, { roles: ["supplier"] });
    const buyer = await createTestUser(ids);
    const { cityId, categoryId } = await createTestCityAndCategory(ids);
    const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
    const ticketType = await createTestTicketType(event.id, { quantity: 5, priceFcfa: 5_000 });

    const payment = await prisma.payment.create({
      data: {
        user_id: buyer.id, amount: 5_000, payment_method: "manual_mobile_money", status: "completed",
        booking_type: "event", booking_id: "placeholder", platform_fee: 0, supplier_amount: 5_000,
      },
      select: { id: true },
    });

    const booking = await prisma.eventBooking.create({
      data: {
        user_id: buyer.id, event_id: event.id, ticket_type_id: ticketType.id, quantity: 1,
        unit_price_fcfa: 5_000, subtotal_fcfa: 5_000, total_amount: 5_000, commission_fcfa: 0,
        status: "confirmed", qr_code: "pending", payment_id: payment.id,
      },
      select: { id: true },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { booking_id: booking.id } });
    await issueTicketsForBooking(booking.id);

    const ticket = await prisma.eventTicket.findFirstOrThrow({ where: { booking_id: booking.id } });

    await Promise.all([
      cancelTickets({ bookingId: booking.id, ticketIds: [ticket.id], paymentId: payment.id }),
      cancelTickets({ bookingId: booking.id, ticketIds: [ticket.id], paymentId: payment.id }),
    ]);

    const refunds = await prisma.refund.findMany({ where: { payment_id: payment.id } });
    expect(refunds).toHaveLength(1);
  });

  it("never creates two refunds for the same rejected event's listing fee", async () => {
    const organizer = await createTestUser(ids, { roles: ["supplier"] });
    const { cityId, categoryId } = await createTestCityAndCategory(ids);
    const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId, status: "rejected" });

    await prisma.payment.create({
      data: {
        user_id: organizer.id, amount: 2_000, payment_method: "manual_mobile_money", status: "completed",
        booking_type: "event_listing", booking_id: event.id, platform_fee: 2_000, supplier_amount: 0,
      },
    });

    const first = await refundEventListingPayment(event.id);
    const second = await refundEventListingPayment(event.id);

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("already_refunded");

    const refunds = await prisma.refund.findMany({ where: { booking_type: "event_listing", booking_id: event.id } });
    expect(refunds).toHaveLength(1);
  });
});
