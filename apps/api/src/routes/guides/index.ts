/**
 * routes/guides/index.ts — Guides touristiques VIVRE
 *
 * GET  /guides            — Liste des guides approuvés (filtres: city_id, language, specialty)
 * GET  /guides/:id        — Profil complet d'un guide
 * POST /guides/:id/book   — Créer une réservation de guide (authentifié)
 * GET  /guides/me/bookings — Mes réservations de guides (authentifié)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";

const listQuerySchema = z.object({
  city_id:   z.string().uuid().optional(),
  language:  z.string().optional(),
  specialty: z.string().optional(),
  limit:     z.coerce.number().int().min(1).max(50).default(20),
  offset:    z.coerce.number().int().min(0).default(0),
});

const bookingSchema = z.object({
  booking_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_type:     z.enum(["full_day", "half_day", "custom"]),
  duration_hours:   z.number().positive().optional(),
  group_size:       z.number().int().min(1).max(50),
  attraction_ids:   z.array(z.string().uuid()).default([]),
  custom_itinerary: z.string().max(2000).optional(),
  special_requests: z.string().max(500).optional(),
});

export const guidesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /guides/me/bookings — Mes réservations (authentifié)
   * IMPORTANT : avant /:id
   * ============================================================ */
  app.get("/me/bookings", async (request, reply) => {
    await authenticate(request, reply);
    const userId = (request as unknown as { user: { id: string } }).user.id;

    const bookings = await prisma.guideBooking.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        booking_date: true,
        booking_type: true,
        duration_hours: true,
        group_size: true,
        attraction_ids: true,
        total_amount: true,
        status: true,
        created_at: true,
        guide: {
          select: {
            id: true,
            daily_rate_fcfa: true,
            user: { select: { first_name: true, last_name: true, avatar_url: true } },
            city: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return reply.send({ bookings });
  });

  /* ============================================================
   * GET /guides — Liste des guides approuvés
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = listQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, language, specialty, limit, offset } = parseResult.data;

    const guides = await prisma.guide.findMany({
      where: {
        is_approved: true,
        is_active: true,
        deleted_at: null,
        ...(city_id ? {
          OR: [
            { city_id },
            { zones_covered: { has: city_id } },
          ],
        } : {}),
        ...(language  ? { languages:   { has: language  } } : {}),
        ...(specialty ? { specialties: { has: specialty } } : {}),
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
        city: { select: { id: true, name: true } },
        user: { select: { first_name: true, last_name: true, avatar_url: true } },
      },
      orderBy: [{ is_ontb_certified: "desc" }, { rating_avg: "desc" }],
      take: limit,
      skip: offset,
    });

    return reply.send({ guides });
  });

  /* ============================================================
   * GET /guides/:id — Profil complet
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const guide = await prisma.guide.findUnique({
      where: { id },
      include: {
        city: { select: { id: true, name: true } },
        user: { select: { first_name: true, last_name: true, avatar_url: true, phone: true } },
      },
    });

    if (!guide || !guide.is_approved || !guide.is_active || guide.deleted_at) {
      return reply.status(404).send({ error: "Guide introuvable", code: "NOT_FOUND" });
    }

    /* Nombre de réservations complétées pour afficher l'expérience */
    const completedTrips = await prisma.guideBooking.count({
      where: { guide_id: id, status: "completed" },
    });

    return reply.send({ guide: { ...guide, completed_trips: completedTrips } });
  });

  /* ============================================================
   * POST /guides/:id/book — Réserver un guide
   * ============================================================ */
  app.post("/:id/book", async (request, reply) => {
    await authenticate(request, reply);
    const userId = (request as unknown as { user: { id: string } }).user.id;
    const { id: guideId } = request.params as { id: string };

    const body = bookingSchema.parse(request.body);

    /* Vérifier que le guide est disponible */
    const guide = await prisma.guide.findUnique({
      where: { id: guideId },
      select: {
        id: true,
        daily_rate_fcfa: true,
        half_day_rate_fcfa: true,
        is_approved: true,
        is_active: true,
        deleted_at: true,
      },
    });

    if (!guide || !guide.is_approved || !guide.is_active || guide.deleted_at) {
      return reply.status(404).send({ error: "Guide introuvable", code: "NOT_FOUND" });
    }

    /* Vérifier conflit de réservation pour la même date */
    const conflict = await prisma.guideBooking.findFirst({
      where: {
        guide_id: guideId,
        booking_date: body.booking_date,
        status: { notIn: ["cancelled", "rejected"] },
      },
    });

    if (conflict) {
      return reply.status(409).send({
        error: "Le guide n'est pas disponible à cette date",
        code: "GUIDE_UNAVAILABLE",
      });
    }

    /* Calculer le montant */
    let totalAmount: number;
    if (body.booking_type === "full_day") {
      totalAmount = guide.daily_rate_fcfa;
    } else if (body.booking_type === "half_day") {
      totalAmount = guide.half_day_rate_fcfa ?? Math.round(guide.daily_rate_fcfa * 0.6);
    } else {
      /* custom — tarif horaire basé sur le tarif journalier / 8h */
      const hourlyRate = Math.round(guide.daily_rate_fcfa / 8);
      totalAmount = hourlyRate * (body.duration_hours ?? 4);
    }

    const booking = await prisma.guideBooking.create({
      data: {
        user_id:          userId,
        guide_id:         guideId,
        booking_date:     body.booking_date,
        booking_type:     body.booking_type,
        duration_hours:   body.duration_hours ?? null,
        group_size:       body.group_size,
        attraction_ids:   body.attraction_ids,
        custom_itinerary: body.custom_itinerary ?? null,
        special_requests: body.special_requests ?? null,
        total_amount:     totalAmount,
        status:           "pending",
      },
    });

    return reply.status(201).send({ booking_id: booking.id, total_amount: totalAmount });
  });
};
