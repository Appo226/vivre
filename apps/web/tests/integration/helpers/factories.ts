/**
 * tests/integration/helpers/factories.ts — Création de données de test minimales et valides.
 */

import { randomUUID } from "crypto";
import { prisma } from "./db";
import type { TrackedIds } from "./db";

export async function createTestUser(
  ids: TrackedIds,
  overrides: { roles?: string[] } = {}
): Promise<{ id: string; phone: string }> {
  const phone = `+2266${Math.floor(10000000 + Math.random() * 89999999)}`;
  const user = await prisma.user.create({
    data: {
      phone,
      first_name: "Test",
      last_name: "User",
      is_verified: true,
      preferred_language: "fr",
    },
    select: { id: true, phone: true },
  });
  ids.userIds.push(user.id);

  for (const role of overrides.roles ?? ["customer"]) {
    await prisma.userRole.create({ data: { user_id: user.id, role, is_approved: true } });
  }

  return user;
}

export async function createTestCityAndCategory(
  ids: TrackedIds
): Promise<{ cityId: string; categoryId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const city = await prisma.city.create({
    data: { name: `TestCity-${suffix}`, region: "Test", latitude: 12.3, longitude: -1.5 },
    select: { id: true },
  });
  ids.cityIds.push(city.id);

  const category = await prisma.eventCategory.create({
    data: { name: `TestCategory-${suffix}` },
    select: { id: true },
  });
  ids.categoryIds.push(category.id);

  return { cityId: city.id, categoryId: category.id };
}

export interface TestEventOptions {
  organizerId: string;
  cityId: string;
  categoryId: string;
  status?: string;
  startsAt?: Date;
  endsAt?: Date;
  commissionPercent?: number;
}

export async function createTestEvent(ids: TrackedIds, opts: TestEventOptions) {
  const suffix = randomUUID().slice(0, 8);
  const startsAt = opts.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = opts.endsAt ?? new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

  const event = await prisma.event.create({
    data: {
      organizer_id: opts.organizerId,
      city_id: opts.cityId,
      category_id: opts.categoryId,
      title: `Test Event ${suffix}`,
      slug: `test-event-${suffix}`,
      description: "Événement de test — créé par la suite d'intégration Vitest",
      venue_name: "Salle de test",
      venue_address: "Adresse de test",
      starts_at: startsAt,
      ends_at: endsAt,
      max_capacity: 1000,
      status: opts.status ?? "approved",
      commission_percent: opts.commissionPercent ?? 8,
      has_paid_publishing: true,
    },
    select: { id: true, commission_percent: true },
  });
  ids.eventIds.push(event.id);

  return event;
}

export async function createTestTicketType(
  eventId: string,
  opts: { priceFcfa?: number; quantity?: number; maxPerOrder?: number } = {}
) {
  return prisma.eventTicketType.create({
    data: {
      event_id: eventId,
      name: "Standard",
      price_fcfa: opts.priceFcfa ?? 5_000,
      quantity: opts.quantity ?? 10,
      max_per_order: opts.maxPerOrder ?? 10,
    },
    select: { id: true, price_fcfa: true, quantity: true },
  });
}
