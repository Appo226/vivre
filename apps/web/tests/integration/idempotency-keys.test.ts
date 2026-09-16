/**
 * Vérifie la sémantique exacte de concurrence des clés d'idempotence (correction 3) :
 * pas d'attente indéfinie, comportement déterministe dans les 4 cas requis.
 */

import { describe, it, expect, afterAll } from "vitest";
import { claimIdempotencyKey, resolveIdempotencyKey } from "@/lib/idempotency";
import { NextResponse } from "next/server";
import { prisma, newTrackedIds, cleanupTrackedIds } from "./helpers/db";
import { createTestUser } from "./helpers/factories";
import { makeRequest } from "./helpers/auth";
import { POST as createBooking } from "@/app/api/events/bookings/route";
import { mintTestToken } from "./helpers/auth";
import { createTestCityAndCategory, createTestEvent, createTestTicketType } from "./helpers/factories";

const ids = newTrackedIds();

async function readJson(res: NextResponse): Promise<unknown> {
  return JSON.parse(await (res as unknown as Response).text());
}

describe("idempotency key concurrency", () => {
  afterAll(async () => {
    await cleanupTrackedIds(ids);
    await prisma.$disconnect();
  });

  it("new key executes; same key + same body replays the completed response", async () => {
    const user = await createTestUser(ids);
    const key = crypto.randomUUID();
    const body = { foo: "bar" };

    const req1 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const claim1 = await claimIdempotencyKey(req1, user.id, "event_booking_create", body);
    expect(claim1).not.toBeInstanceOf(NextResponse); // clé neuve → exécution

    if (claim1 instanceof NextResponse) throw new Error("unreachable");
    await resolveIdempotencyKey(claim1, 201, { result: "ok" });

    const req2 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const claim2 = await claimIdempotencyKey(req2, user.id, "event_booking_create", body);
    expect(claim2).toBeInstanceOf(NextResponse);
    if (!(claim2 instanceof NextResponse)) throw new Error("unreachable");
    expect(claim2.status).toBe(201);
    expect(await readJson(claim2)).toEqual({ result: "ok" });
  });

  it("same key + different body hash returns 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const user = await createTestUser(ids);
    const key = crypto.randomUUID();

    const req1 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const claim1 = await claimIdempotencyKey(req1, user.id, "payment_initiate", { a: 1 });
    if (claim1 instanceof NextResponse) throw new Error("unreachable");
    await resolveIdempotencyKey(claim1, 200, { done: true });

    const req2 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const claim2 = await claimIdempotencyKey(req2, user.id, "payment_initiate", { a: 2 });
    expect(claim2).toBeInstanceOf(NextResponse);
    if (!(claim2 instanceof NextResponse)) throw new Error("unreachable");
    expect(claim2.status).toBe(409);
    expect((await readJson(claim2) as { code: string }).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("missing header returns 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    const user = await createTestUser(ids);
    const req = makeRequest("http://localhost/x");
    const claim = await claimIdempotencyKey(req, user.id, "event_booking_create", {});
    expect(claim).toBeInstanceOf(NextResponse);
    if (!(claim instanceof NextResponse)) throw new Error("unreachable");
    expect(claim.status).toBe(400);
    expect((await readJson(claim) as { code: string }).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("same key + same body while in_progress: bounded wait, never indefinite", async () => {
    const user = await createTestUser(ids);
    const key = crypto.randomUUID();
    const body = { still: "in progress" };

    // Simule une première requête qui n'a jamais résolu sa clé (toujours "in_progress").
    const req1 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const claim1 = await claimIdempotencyKey(req1, user.id, "event_booking_create", body);
    if (claim1 instanceof NextResponse) throw new Error("unreachable");

    const req2 = makeRequest("http://localhost/x", { headers: { "Idempotency-Key": key } });
    const start = Date.now();
    const claim2 = await claimIdempotencyKey(req2, user.id, "event_booking_create", body);
    const elapsedMs = Date.now() - start;

    // Une SEULE attente bornée (≈500ms), jamais une boucle indéfinie — marge généreuse pour
    // la latence réseau vers Supabase, mais toujours largement sous une seconde.
    expect(elapsedMs).toBeLessThan(3_000);
    expect(claim2).toBeInstanceOf(NextResponse);
    if (!(claim2 instanceof NextResponse)) throw new Error("unreachable");
    expect(claim2.status).toBe(409);
    expect((await readJson(claim2) as { code: string }).code).toBe("REQUEST_IN_PROGRESS");
  });

  it("POST /events/bookings rejects a missing Idempotency-Key with 400 (valid request otherwise)", async () => {
    // La requête doit être par ailleurs entièrement valide — la vérification de la clé
    // n'intervient que juste avant l'écriture réelle, après toutes les validations métier
    // (voir events/bookings/route.ts). Un event_id/ticket_type_id inexistant renverrait 404
    // AVANT même d'atteindre la vérification d'idempotence, ce qui ne testerait pas la bonne
    // chose.
    const organizer = await createTestUser(ids, { roles: ["supplier"] });
    const buyer = await createTestUser(ids);
    const { cityId, categoryId } = await createTestCityAndCategory(ids);
    const event = await createTestEvent(ids, { organizerId: organizer.id, cityId, categoryId });
    const ticketType = await createTestTicketType(event.id, { quantity: 5 });

    const token = await mintTestToken(buyer.id, buyer.phone);
    const req = makeRequest("http://localhost/api/events/bookings", {
      method: "POST",
      token,
      body: { event_id: event.id, ticket_type_id: ticketType.id, quantity: 1 },
    });
    const res = await createBooking(req);
    expect(res.status).toBe(400);
    expect((await readJson(res) as { code: string }).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});
