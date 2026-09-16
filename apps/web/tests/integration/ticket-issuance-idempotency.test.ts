/**
 * Vérifie qu'issueTicketsForBooking() n'émet jamais deux fois les billets d'une même
 * commande, en séquentiel comme en concurrent.
 */

import { describe, it, expect, afterAll } from "vitest";
import { issueTicketsForBooking } from "@/lib/events";
import { prisma, newTrackedIds, cleanupTrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";

const ids = newTrackedIds();

async function createConfirmedBooking(quantity: number) {
  const organizer = await createTestUser(ids, { roles: ["supplier"] });
  const buyer = await createTestUser(ids);
  const { cityId, categoryId } = await createTestCityAndCategory(ids);
  const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
  const ticketType = await createTestTicketType(event.id, { quantity: 10, priceFcfa: 5_000 });

  const booking = await prisma.eventBooking.create({
    data: {
      user_id: buyer.id,
      event_id: event.id,
      ticket_type_id: ticketType.id,
      quantity,
      unit_price_fcfa: ticketType.price_fcfa,
      subtotal_fcfa: ticketType.price_fcfa * quantity,
      total_amount: ticketType.price_fcfa * quantity,
      commission_fcfa: 0,
      status: "confirmed",
      qr_code: "pending",
    },
    select: { id: true },
  });

  return booking.id;
}

describe("issueTicketsForBooking idempotency", () => {
  afterAll(async () => {
    await cleanupTrackedIds(ids);
    await prisma.$disconnect();
  });

  it("never double-issues tickets on sequential calls", async () => {
    const bookingId = await createConfirmedBooking(4);

    await issueTicketsForBooking(bookingId);
    await issueTicketsForBooking(bookingId);
    await issueTicketsForBooking(bookingId);

    const tickets = await prisma.eventTicket.findMany({ where: { booking_id: bookingId } });
    expect(tickets).toHaveLength(4);
    expect(new Set(tickets.map((t) => t.ticket_number)).size).toBe(4);
  });

  it("never double-issues tickets on concurrent calls", async () => {
    const bookingId = await createConfirmedBooking(3);

    await Promise.all([
      issueTicketsForBooking(bookingId),
      issueTicketsForBooking(bookingId),
      issueTicketsForBooking(bookingId),
    ]);

    const tickets = await prisma.eventTicket.findMany({ where: { booking_id: bookingId } });
    expect(tickets).toHaveLength(3);
    expect(new Set(tickets.map((t) => t.ticket_number)).size).toBe(3);
  });
});
