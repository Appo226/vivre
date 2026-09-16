/**
 * Vérifie que le verrou SELECT...FOR UPDATE dans POST /api/events/bookings empêche
 * effectivement la survente sous une charge concurrente réelle.
 */

import { describe, it, expect, afterAll } from "vitest";
import { POST as createBooking } from "@/app/api/events/bookings/route";
import { prisma } from "./helpers/db";
import { newTrackedIds, cleanupTrackedIds } from "./helpers/db";
import { createTestUser, createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";
import { mintTestToken, makeRequest } from "./helpers/auth";

const ids = newTrackedIds();

describe("booking overselling protection", () => {
  afterAll(async () => {
    await cleanupTrackedIds(ids);
    await prisma.$disconnect();
  });

  it("never sells more tickets than available under concurrent requests", async () => {
    const organizer = await createTestUser(ids, { roles: ["supplier"] });
    const { cityId, categoryId } = await createTestCityAndCategory(ids);
    const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
    const ticketType = await createTestTicketType(event.id, { quantity: 3, priceFcfa: 5_000 });

    const buyers = await Promise.all(
      Array.from({ length: 10 }, () => createTestUser(ids))
    );

    const responses = await Promise.all(
      buyers.map(async (buyer) => {
        const token = await mintTestToken(buyer.id, buyer.phone);
        const request = makeRequest("http://localhost/api/events/bookings", {
          method: "POST",
          token,
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: { event_id: event.id, ticket_type_id: ticketType.id, quantity: 1 },
        });
        return createBooking(request);
      })
    );

    const statuses = responses.map((r) => r.status);
    const succeeded = statuses.filter((s) => s === 201).length;
    const rejected = statuses.filter((s) => s === 409).length;

    expect(succeeded).toBe(3);
    expect(rejected).toBe(7);

    const sold = await prisma.eventBooking.aggregate({
      where: { ticket_type_id: ticketType.id, status: { in: ["pending", "confirmed", "checked_in"] } },
      _sum: { quantity: true },
    });
    expect(sold._sum.quantity ?? 0).toBeLessThanOrEqual(3);
  });
});
