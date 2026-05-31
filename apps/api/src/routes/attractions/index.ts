/**
 * routes/attractions/index.ts — Attractions touristiques VIVRE
 *
 * GET /attractions            — Liste filtrée (city_id, category, featured)
 * GET /attractions/featured   — Top attractions mises en avant
 * GET /attractions/:id        — Détail d'une attraction
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";

const listQuerySchema = z.object({
  city_id:  z.string().uuid().optional(),
  category: z.enum(["nature", "culture", "heritage", "event", "urban"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
  limit:    z.coerce.number().int().min(1).max(50).default(20),
  offset:   z.coerce.number().int().min(0).default(0),
});

export const attractionsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /attractions/featured — Top attractions mises en avant
   * IMPORTANT : avant /:id pour éviter le match comme paramètre
   * ============================================================ */
  app.get("/featured", async (_request, reply) => {
    const attractions = await prisma.attraction.findMany({
      where: { is_featured: true, is_active: true },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        latitude: true,
        longitude: true,
        entry_fee_fcfa: true,
        visit_duration_hours: true,
        best_season: true,
        is_unesco: true,
        rating_avg: true,
        city: { select: { id: true, name: true } },
      },
      orderBy: { rating_avg: "desc" },
      take: 10,
    });

    return reply.send({ attractions });
  });

  /* ============================================================
   * GET /attractions — Liste avec filtres
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = listQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, category, featured, limit, offset } = parseResult.data;

    const attractions = await prisma.attraction.findMany({
      where: {
        is_active: true,
        ...(city_id   ? { city_id }               : {}),
        ...(category  ? { category }               : {}),
        ...(featured  ? { is_featured: featured === "true" } : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        entry_fee_fcfa: true,
        visit_duration_hours: true,
        best_season: true,
        is_unesco: true,
        is_featured: true,
        rating_avg: true,
        city: { select: { id: true, name: true } },
      },
      orderBy: [{ is_featured: "desc" }, { rating_avg: "desc" }],
      take: limit,
      skip: offset,
    });

    const total = await prisma.attraction.count({
      where: {
        is_active: true,
        ...(city_id   ? { city_id }               : {}),
        ...(category  ? { category }               : {}),
        ...(featured  ? { is_featured: featured === "true" } : {}),
      },
    });

    return reply.send({ attractions, total, limit, offset });
  });

  /* ============================================================
   * GET /attractions/:id — Détail complet
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const attraction = await prisma.attraction.findUnique({
      where: { id },
      include: { city: { select: { id: true, name: true } } },
    });

    if (!attraction || !attraction.is_active) {
      return reply.status(404).send({ error: "Attraction introuvable", code: "NOT_FOUND" });
    }

    /* Guides certifiés couvrant la ville de l'attraction */
    const guides = attraction.city_id
      ? await prisma.guide.findMany({
          where: {
            is_approved: true,
            is_active: true,
            deleted_at: null,
            zones_covered: { has: attraction.city_id },
          },
          select: {
            id: true,
            bio: true,
            languages: true,
            specialties: true,
            daily_rate_fcfa: true,
            half_day_rate_fcfa: true,
            is_ontb_certified: true,
            rating_avg: true,
            experience_years: true,
            user: { select: { first_name: true, last_name: true, avatar_url: true } },
          },
          take: 5,
          orderBy: { rating_avg: "desc" },
        })
      : [];

    return reply.send({ attraction, guides });
  });
};
