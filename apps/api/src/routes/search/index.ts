/**
 * routes/search/index.ts — Recherche universelle VIVRE
 *
 * GET /search?q=&city_id=&types=
 *
 * Fans out en parallèle vers 5 entités, retourne des résultats groupés.
 * Public (pas d'auth requise) — utiliser pour l'autocomplétion du home.
 *
 * Paramètres :
 *   q        — terme de recherche (min 2 caractères)
 *   city_id  — filtrer par ville (optionnel)
 *   types    — liste CSV des types à inclure (optionnel, défaut = tous)
 *              restaurant,property,event,transport,service
 *   limit    — résultats max par catégorie (défaut 5, max 10)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";

const querySchema = z.object({
  q: z.string().min(2).max(100),
  city_id: z.string().optional(),
  types: z.string().optional(), // "restaurant,property,event,transport,service"
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ error: "Paramètre q requis (min 2 caractères)", code: "VALIDATION_ERROR" });
    }

    const { q, city_id, limit } = parsed.data;
    const typeFilter = parsed.data.types
      ? new Set(parsed.data.types.split(",").map((t) => t.trim()))
      : null; // null = tous les types

    const want = (type: string) => !typeFilter || typeFilter.has(type);

    /* Lancer toutes les recherches en parallèle */
    const [restaurants, properties, events, trips, services] = await Promise.all([
      /* ── Restaurants ── */
      want("restaurant")
        ? prisma.restaurant.findMany({
            where: {
              is_approved: true,
              is_active: true,
              deleted_at: null,
              ...(city_id ? { city_id } : {}),
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              name: true,
              restaurant_type: true,
              address: true,
              rating_avg: true,
              is_open_now: true,
              city: { select: { name: true } },
            },
            orderBy: { rating_avg: "desc" },
            take: limit,
          })
        : Promise.resolve([]),

      /* ── Hébergements ── */
      want("property")
        ? prisma.property.findMany({
            where: {
              is_approved: true,
              is_active: true,
              ...(city_id ? { city_id } : {}),
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              name: true,
              property_type: true,
              address: true,
              star_rating: true,
              rating_avg: true,
              city: { select: { name: true } },
            },
            orderBy: { rating_avg: "desc" },
            take: limit,
          })
        : Promise.resolve([]),

      /* ── Événements ── */
      want("event")
        ? prisma.event.findMany({
            where: {
              status: "approved",
              starts_at: { gte: new Date() },
              ...(city_id ? { city_id } : {}),
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { venue_name: { contains: q, mode: "insensitive" } },
                { venue_address: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              title: true,
              venue_name: true,
              starts_at: true,
              cover_url: true,
              city: { select: { name: true } },
            },
            orderBy: { starts_at: "asc" },
            take: limit,
          })
        : Promise.resolve([]),

      /* ── Transport ── */
      want("transport")
        ? prisma.route.findMany({
            where: {
              is_active: true,
              deleted_at: null,
              AND: [
                {
                  OR: [
                    { origin_city: { name: { contains: q, mode: "insensitive" } } },
                    { destination_city: { name: { contains: q, mode: "insensitive" } } },
                    { company: { name: { contains: q, mode: "insensitive" } } },
                  ],
                },
                ...(city_id
                  ? [{ OR: [{ origin_city_id: city_id }, { destination_city_id: city_id }] }]
                  : []),
              ],
            },
            select: {
              id: true,
              bus_type: true,
              distance_km: true,
              duration_minutes: true,
              origin_city: { select: { name: true } },
              destination_city: { select: { name: true } },
              company: { select: { name: true } },
              schedules: {
                where: { is_active: true },
                select: { base_price: true },
                take: 1,
              },
            },
            take: limit,
          })
        : Promise.resolve([]),

      /* ── Services publics ── */
      want("service")
        ? prisma.publicService.findMany({
            where: {
              is_active: true,
              ...(city_id ? { city_id } : {}),
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              name: true,
              address: true,
              phone_primary: true,
              is_24h: true,
              is_open_now: true,
              category: { select: { slug: true, name_fr: true, icon: true } },
              city: { select: { name: true } },
            },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    /* Compter le total pour les méta-informations */
    const total =
      restaurants.length +
      properties.length +
      events.length +
      trips.length +
      services.length;

    return reply.send({
      q,
      total,
      results: {
        restaurants: restaurants.map((r) => ({
          id: r.id,
          type: "restaurant" as const,
          title: r.name,
          subtitle: r.restaurant_type,
          meta: r.is_open_now ? "Ouvert" : "Fermé",
          rating: r.rating_avg,
          city: r.city.name,
          href: `/food?restaurant=${r.id}`,
        })),
        properties: properties.map((p) => ({
          id: p.id,
          type: "property" as const,
          title: p.name,
          subtitle: p.property_type,
          meta: p.star_rating ? `${p.star_rating}★` : null,
          rating: p.rating_avg,
          city: p.city.name,
          href: `/hebergement/${p.id}`,
        })),
        events: events.map((e) => ({
          id: e.id,
          type: "event" as const,
          title: e.title,
          subtitle: e.venue_name,
          meta: new Date(e.starts_at).toLocaleDateString("fr-BF", { day: "numeric", month: "short" }),
          city: e.city.name,
          cover_url: e.cover_url,
          href: `/evenements/${e.id}`,
        })),
        transport: trips.map((r) => ({
          id: r.id,
          type: "transport" as const,
          title: `${r.origin_city.name} → ${r.destination_city.name}`,
          subtitle: r.company.name,
          meta: r.schedules[0] ? `${r.schedules[0].base_price.toLocaleString()} FCFA` : null,
          city: r.origin_city.name,
          href: `/transport?from=${r.origin_city.name}&to=${r.destination_city.name}`,
        })),
        services: services.map((s) => ({
          id: s.id,
          type: "service" as const,
          title: s.name,
          subtitle: s.category.name_fr,
          meta: s.is_24h ? "24h/24" : s.is_open_now ? "Ouvert" : "Fermé",
          phone: s.phone_primary,
          city: s.city.name,
          href: `/urgences`,
        })),
      },
    });
  });
};
