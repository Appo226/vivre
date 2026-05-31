/**
 * routes/events/index.ts — Module Événements & Billets
 *
 * Endpoints publics (pas de token requis) :
 *   GET  /events                      — Découverte d'événements (filtres : ville, catégorie, date, recherche)
 *   GET  /events/categories           — Liste des catégories
 *   GET  /events/:id                  — Détail d'un événement + types de billets
 *
 * Endpoints utilisateur (token JWT requis) :
 *   POST /events/bookings             — Réserver des billets
 *   GET  /events/bookings/me          — Mes billets
 *   GET  /events/bookings/:id         — Détail d'un billet (avec QR code)
 *   DELETE /events/bookings/:id       — Annuler une réservation
 *
 * Endpoints organisateur (token JWT requis, rôle supplier) :
 *   POST /events                      — Publier un nouvel événement (→ "pending_approval")
 *   PUT  /events/:id                  — Modifier son événement (si brouillon ou rejeté)
 *   GET  /events/mine                 — Mes événements (organisateur)
 *
 * Endpoints admin (token JWT requis, rôle admin) :
 *   PATCH /events/:id/approve         — Approuver un événement
 *   PATCH /events/:id/reject          — Rejeter un événement avec raison
 *   PATCH /events/:id/pricing         — Modifier les tarifs VIVRE (frais/commission)
 *   POST  /events/:id/notify-police   — Marquer comme notifié à la police
 *   GET   /events/:id/police-report   — Rapport structuré pour les autorités
 *
 * Endpoint scanner (token JWT requis, rôle staff ou admin) :
 *   POST /events/bookings/:id/scan    — Valider un billet à l'entrée (check-in)
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { z } from "zod";

/* ============================================================
 * SCHÉMAS DE VALIDATION
 * ============================================================ */

const EventsQuerySchema = z.object({
  city_id:     z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  /* Recherche par nom — utilisé par la barre de recherche TI-001 style */
  q:           z.string().max(100).optional(),
  /* Filtrer sur les événements qui commencent après cette date YYYY-MM-DD */
  from_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  featured:    z.enum(["true", "false"]).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(50).default(20),
});

const CreateEventSchema = z.object({
  city_id:            z.string().uuid(),
  category_id:        z.string().uuid(),
  title:              z.string().min(3).max(200),
  description:        z.string().min(20).max(10000),
  venue_name:         z.string().min(2).max(200),
  venue_address:      z.string().min(5).max(500),
  latitude:           z.number().min(-90).max(90).optional(),
  longitude:          z.number().min(-180).max(180).optional(),
  starts_at:          z.string().datetime({ message: "starts_at doit être une date ISO 8601" }),
  ends_at:            z.string().datetime({ message: "ends_at doit être une date ISO 8601" }),
  max_capacity:       z.number().int().min(1).max(100000),
  safety_description: z.string().max(5000).optional(),
  expected_profile:   z.string().max(500).optional(),
  ticket_types: z.array(z.object({
    name:          z.string().min(1).max(100),
    description:   z.string().max(500).optional(),
    price_fcfa:    z.number().int().min(0),
    quantity:      z.number().int().min(1),
    max_per_order: z.number().int().min(1).max(100).default(10),
    sale_starts_at: z.string().datetime().optional(),
    sale_ends_at:   z.string().datetime().optional(),
  })).min(1, "Au moins 1 type de billet requis"),
});

/* UpdateEventSchema reserved for PUT /events/:id (future endpoint) */
// const UpdateEventSchema = CreateEventSchema.partial().omit({ ticket_types: true });

const CreateBookingSchema = z.object({
  event_id:       z.string().uuid(),
  ticket_type_id: z.string().uuid(),
  quantity:       z.number().int().min(1).max(10),
});

const RejectEventSchema = z.object({
  reason: z.string().min(10, "La raison doit être expliquée (min 10 caractères)"),
});

const PricingUpdateSchema = z.object({
  publishing_fee_fcfa: z.number().int().min(0).optional(),
  commission_percent:  z.number().min(0).max(50).optional(),
});

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Génère le slug URL d'un événement à partir de son titre et de la date.
 * Ex: "Faso Fest 2026 — Ouagadougou" → "faso-fest-2026-ouagadougou-20260615"
 */
function generateSlug(title: string, date: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") /* Supprimer les accents */
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  const dateSuffix = date.slice(0, 10).replace(/-/g, "");
  /* Ajouter un timestamp court pour l'unicité */
  const unique = Date.now().toString(36);
  return `${base}-${dateSuffix}-${unique}`;
}

/**
 * Génère le QR code d'un billet d'événement.
 * Encode : bookingId, eventId, userId, quantity, ticketType.
 */
function generateEventQr(
  bookingId: string,
  eventId: string,
  userId: string,
  ticketTypeName: string,
  quantity: number
): string {
  const data = { b: bookingId, e: eventId, u: userId, t: ticketTypeName, q: quantity };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/* ============================================================
 * ROUTES
 * ============================================================ */

export const eventsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /events/categories — Liste des catégories
   * ============================================================ */
  app.get("/categories", async (_request, reply) => {
    const categories = await prisma.eventCategory.findMany({
      where: { is_active: true },
      select: { id: true, name: true, name_en: true, icon: true, color_hex: true },
      orderBy: { name: "asc" },
    });
    return reply.status(200).send({ categories });
  });

  /* ============================================================
   * GET /events/mine — Événements de l'organisateur connecté
   * IMPORTANT : déclaré avant /:id pour éviter le conflit de route
   * ============================================================ */
  app.get("/mine", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const page = parseInt((request.query as Record<string, string>)["page"] ?? "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: { organizer_id: userId, deleted_at: null },
        select: {
          id: true, title: true, slug: true, cover_url: true,
          starts_at: true, ends_at: true, status: true, is_featured: true,
          publishing_fee_fcfa: true, has_paid_publishing: true,
          police_notified_at: true,
          city: { select: { name: true } },
          category: { select: { name: true, icon: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.event.count({ where: { organizer_id: userId, deleted_at: null } }),
    ]);

    return reply.status(200).send({
      events: events.map((e) => ({
        ...e,
        starts_at: e.starts_at.toISOString(),
        ends_at: e.ends_at.toISOString(),
        bookings_count: e._count.bookings,
        police_notified_at: e.police_notified_at?.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /events/bookings/me — Mes billets d'événements
   * IMPORTANT : déclaré avant /bookings/:id
   * ============================================================ */
  app.get("/bookings/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const filter = (request.query as Record<string, string>)["filter"] ?? "all";
    const page = parseInt((request.query as Record<string, string>)["page"] ?? "1", 10);
    const limit = 10;
    const offset = (page - 1) * limit;
    const now = new Date();

    type WhereFilter = {
      user_id: string;
      status?: string | { in: string[] };
      event?: { starts_at?: { gt?: Date; lte?: Date } };
    };

    const where: WhereFilter = { user_id: userId };
    if (filter === "upcoming") {
      where.status = { in: ["pending", "confirmed"] };
      where.event = { starts_at: { gt: now } };
    } else if (filter === "past") {
      where.event = { starts_at: { lte: now } };
    } else if (filter === "cancelled") {
      where.status = "cancelled";
    }

    const [bookings, total] = await Promise.all([
      prisma.eventBooking.findMany({
        where,
        select: {
          id: true, quantity: true, total_amount: true, status: true,
          created_at: true, checked_in_at: true,
          ticket_type: { select: { name: true, price_fcfa: true } },
          event: {
            select: {
              id: true, title: true, cover_url: true,
              starts_at: true, ends_at: true, venue_name: true,
              city: { select: { name: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.eventBooking.count({ where }),
    ]);

    return reply.status(200).send({
      bookings: bookings.map((b) => ({
        id: b.id,
        quantity: b.quantity,
        total_amount: b.total_amount,
        status: b.status,
        created_at: b.created_at.toISOString(),
        checked_in_at: b.checked_in_at?.toISOString(),
        ticket_type: b.ticket_type,
        event: {
          ...b.event,
          starts_at: b.event.starts_at.toISOString(),
          ends_at: b.event.ends_at.toISOString(),
        },
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /events/bookings/:id — Détail d'un billet avec QR code
   * ============================================================ */
  app.get("/bookings/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.eventBooking.findUnique({
      where: { id },
      select: {
        id: true, user_id: true, quantity: true, unit_price_fcfa: true,
        total_amount: true, commission_fcfa: true, status: true, qr_code: true,
        checked_in_at: true, cancelled_at: true, cancellation_reason: true,
        created_at: true,
        ticket_type: { select: { id: true, name: true, description: true } },
        event: {
          select: {
            id: true, title: true, cover_url: true, venue_name: true, venue_address: true,
            starts_at: true, ends_at: true, latitude: true, longitude: true,
            city: { select: { name: true } },
            organizer: { select: { first_name: true, last_name: true, phone: true } },
          },
        },
      },
    });

    if (!booking) {
      return reply.status(404).send({ error: "Billet introuvable", code: "BOOKING_NOT_FOUND" });
    }

    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    return reply.status(200).send({
      ...booking,
      checked_in_at: booking.checked_in_at?.toISOString(),
      cancelled_at: booking.cancelled_at?.toISOString(),
      created_at: booking.created_at.toISOString(),
      event: {
        ...booking.event,
        starts_at: booking.event.starts_at.toISOString(),
        ends_at: booking.event.ends_at.toISOString(),
      },
    });
  });

  /* ============================================================
   * DELETE /events/bookings/:id — Annuler un billet
   * ============================================================ */
  app.delete("/bookings/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.eventBooking.findUnique({
      where: { id },
      select: {
        id: true, user_id: true, status: true,
        event: { select: { starts_at: true } },
      },
    });

    if (!booking) {
      return reply.status(404).send({ error: "Billet introuvable", code: "BOOKING_NOT_FOUND" });
    }

    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    if (booking.status === "cancelled") {
      return reply.status(409).send({ error: "Billet déjà annulé", code: "ALREADY_CANCELLED" });
    }

    if (booking.status === "checked_in") {
      return reply.status(409).send({
        error: "Billet déjà utilisé — impossible d'annuler",
        code: "ALREADY_CHECKED_IN",
      });
    }

    /* Politique : annulation impossible si l'événement est dans moins de 24h */
    const deadline = new Date(booking.event.starts_at);
    deadline.setHours(deadline.getHours() - 24);
    if (new Date() > deadline) {
      return reply.status(409).send({
        error: "Impossible d'annuler moins de 24h avant l'événement",
        code: "CANCELLATION_TOO_LATE",
      });
    }

    await prisma.eventBooking.update({
      where: { id },
      data: { status: "cancelled", cancelled_at: new Date() },
    });

    return reply.status(200).send({ message: "Billet annulé avec succès", booking_id: id });
  });

  /* ============================================================
   * POST /events/bookings/:id/scan — Scanner un billet (check-in)
   * Utilisé par le personnel de l'événement via la page scanner.
   * Le scanner doit être connecté avec un compte admin ou supplier de l'événement.
   * ============================================================ */
  app.post("/bookings/:id/scan", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.eventBooking.findUnique({
      where: { id },
      select: {
        id: true, status: true, quantity: true, checked_in_at: true,
        ticket_type: { select: { name: true } },
        event: {
          select: {
            id: true, title: true, organizer_id: true,
            starts_at: true, ends_at: true,
          },
        },
        user: { select: { first_name: true, last_name: true, phone: true } },
      },
    });

    if (!booking) {
      return reply.status(404).send({ valid: false, error: "Billet introuvable", code: "BOOKING_NOT_FOUND" });
    }

    /*
     * Autorisation : seuls l'admin et l'organisateur de l'événement peuvent scanner.
     * En production, on ajouterait un rôle "scanner" assignable par l'organisateur à son staff.
     */
    const isAdmin = request.user.roles.includes("admin");
    const isOrganizer = booking.event.organizer_id === userId;
    if (!isAdmin && !isOrganizer) {
      return reply.status(403).send({
        valid: false,
        error: "Seul l'organisateur ou un admin peut scanner les billets",
        code: "AUTH_FORBIDDEN",
      });
    }

    /* Vérifier que l'événement est en cours ou se commence aujourd'hui */
    const now = new Date();
    const eventStart = new Date(booking.event.starts_at);
    const eventEnd = new Date(booking.event.ends_at);
    const twoHoursBefore = new Date(eventStart);
    twoHoursBefore.setHours(twoHoursBefore.getHours() - 2);

    if (now < twoHoursBefore) {
      return reply.status(409).send({
        valid: false,
        error: "L'événement n'a pas encore commencé (scan possible 2h avant)",
        code: "EVENT_NOT_STARTED",
      });
    }

    if (now > eventEnd) {
      return reply.status(409).send({
        valid: false,
        error: "L'événement est terminé",
        code: "EVENT_ENDED",
      });
    }

    /* Vérifier le statut du billet */
    if (booking.status === "cancelled") {
      return reply.status(200).send({
        valid: false,
        error: "Billet annulé",
        code: "BOOKING_CANCELLED",
      });
    }

    if (booking.status === "checked_in") {
      return reply.status(200).send({
        valid: false,
        error: "Billet déjà scanné",
        code: "ALREADY_CHECKED_IN",
        checked_in_at: booking.checked_in_at?.toISOString(),
      });
    }

    if (booking.status !== "confirmed") {
      return reply.status(200).send({
        valid: false,
        error: `Billet non confirmé (statut: ${booking.status})`,
        code: "BOOKING_NOT_CONFIRMED",
      });
    }

    /* Valider le billet */
    await prisma.eventBooking.update({
      where: { id },
      data: { status: "checked_in", checked_in_at: now },
    });

    return reply.status(200).send({
      valid: true,
      booking_id: id,
      event_title: booking.event.title,
      ticket_type: booking.ticket_type.name,
      quantity: booking.quantity,
      holder: {
        name: [booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || "N/A",
        phone: booking.user.phone,
      },
      checked_in_at: now.toISOString(),
    });
  });

  /* ============================================================
   * GET /events — Découverte d'événements (publique)
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = EventsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, category_id, q, from_date, featured, page, limit } = parseResult.data;
    const offset = (page - 1) * limit;

    /* Date de début de recherche — par défaut : maintenant (pas d'événements passés) */
    const fromDateFilter = from_date ? new Date(from_date) : new Date();

    const where = {
      status: "approved",
      has_paid_publishing: true,
      deleted_at: null,
      starts_at: { gte: fromDateFilter },
      ...(city_id && { city_id }),
      ...(category_id && { category_id }),
      ...(featured === "true" && { is_featured: true }),
      /*
       * Recherche textuelle sur le titre et la description.
       * En production, on utiliserait pg_trgm + GIN index pour du full-text search.
       * Pour le MVP, Prisma contains suffit (ilike).
       */
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { venue_name: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true, title: true, slug: true, cover_url: true,
          starts_at: true, ends_at: true, venue_name: true, is_featured: true,
          city: { select: { name: true } },
          category: { select: { name: true, icon: true, color_hex: true } },
          ticket_types: {
            where: { is_active: true },
            select: { price_fcfa: true },
            orderBy: { price_fcfa: "asc" },
            take: 1, /* Seulement le moins cher pour affichage "à partir de" */
          },
          _count: { select: { bookings: { where: { status: { in: ["pending", "confirmed", "checked_in"] } } } } },
        },
        orderBy: [
          { is_featured: "desc" }, /* Événements mis en avant d'abord */
          { starts_at: "asc" },    /* Puis par date de début */
        ],
        take: limit,
        skip: offset,
      }),
      prisma.event.count({ where }),
    ]);

    return reply.status(200).send({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        cover_url: e.cover_url,
        starts_at: e.starts_at.toISOString(),
        ends_at: e.ends_at.toISOString(),
        venue_name: e.venue_name,
        is_featured: e.is_featured,
        city: e.city,
        category: e.category,
        min_price: e.ticket_types[0]?.price_fcfa ?? 0,
        bookings_count: e._count.bookings,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /events/:id — Détail d'un événement
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    /* Support lookup par UUID ou par slug */
    const isUuid = /^[0-9a-f-]{36}$/.test(id);
    const where = isUuid ? { id } : { slug: id };

    const event = await prisma.event.findFirst({
      where: { ...where, deleted_at: null },
      select: {
        id: true, title: true, slug: true, description: true,
        cover_url: true, gallery_urls: true,
        venue_name: true, venue_address: true, latitude: true, longitude: true,
        starts_at: true, ends_at: true, max_capacity: true,
        status: true, is_featured: true,
        safety_description: true, /* Inclus car public — transparence sur la sécurité */
        city: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, icon: true, color_hex: true } },
        organizer: { select: { id: true, first_name: true, last_name: true } },
        ticket_types: {
          where: { is_active: true },
          select: {
            id: true, name: true, description: true, price_fcfa: true,
            quantity: true, max_per_order: true,
            sale_starts_at: true, sale_ends_at: true,
          },
          orderBy: { price_fcfa: "asc" },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["pending", "confirmed", "checked_in"] } } },
          },
        },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    /* Calculer les places restantes par type de ticket */
    const ticketTypesWithAvailability = await Promise.all(
      event.ticket_types.map(async (tt) => {
        const sold = await prisma.eventBooking.aggregate({
          where: {
            ticket_type_id: tt.id,
            status: { in: ["pending", "confirmed", "checked_in"] },
          },
          _sum: { quantity: true },
        });
        const soldCount = sold._sum.quantity ?? 0;
        return {
          ...tt,
          available: Math.max(0, tt.quantity - soldCount),
          sale_starts_at: tt.sale_starts_at?.toISOString(),
          sale_ends_at: tt.sale_ends_at?.toISOString(),
        };
      })
    );

    return reply.status(200).send({
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      cover_url: event.cover_url,
      gallery_urls: event.gallery_urls,
      venue_name: event.venue_name,
      venue_address: event.venue_address,
      latitude: event.latitude,
      longitude: event.longitude,
      starts_at: event.starts_at.toISOString(),
      ends_at: event.ends_at.toISOString(),
      max_capacity: event.max_capacity,
      status: event.status,
      is_featured: event.is_featured,
      safety_description: event.safety_description,
      city: event.city,
      category: event.category,
      organizer: event.organizer,
      ticket_types: ticketTypesWithAvailability,
      total_bookings: event._count.bookings,
    });
  });

  /* ============================================================
   * POST /events — Créer un événement (organisateur)
   * L'événement est créé en "draft" — l'organisateur soumet ensuite.
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreateEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const data = parseResult.data;
    const userId = request.user.sub;

    /* Vérifier que starts_at < ends_at et que les dates sont dans le futur */
    const startsAt = new Date(data.starts_at);
    const endsAt = new Date(data.ends_at);

    if (startsAt >= endsAt) {
      return reply.status(422).send({
        error: "La date de fin doit être après la date de début",
        code: "INVALID_DATES",
      });
    }

    if (startsAt < new Date()) {
      return reply.status(422).send({
        error: "La date de début doit être dans le futur",
        code: "DATE_IN_PAST",
      });
    }

    const slug = generateSlug(data.title, data.starts_at);

    const event = await prisma.event.create({
      data: {
        organizer_id: userId,
        city_id: data.city_id,
        category_id: data.category_id,
        title: data.title,
        slug,
        description: data.description,
        venue_name: data.venue_name,
        venue_address: data.venue_address,
        /*
         * Prisma génère Float? = Float | null, mais Zod renvoie number | undefined.
         * exactOptionalPropertyTypes interdit undefined pour les champs nullable.
         * On mappe undefined → null explicitement pour tous les champs optionnels.
         */
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        max_capacity: data.max_capacity,
        safety_description: data.safety_description ?? null,
        expected_profile: data.expected_profile ?? null,
        status: "draft",
        ticket_types: {
          create: data.ticket_types.map((tt) => ({
            name: tt.name,
            /*
             * description est String? (nullable) en Prisma mais Zod renvoie string | undefined.
             * On mappe undefined → null pour satisfaire exactOptionalPropertyTypes.
             */
            description: tt.description ?? null,
            price_fcfa: tt.price_fcfa,
            quantity: tt.quantity,
            max_per_order: tt.max_per_order,
            ...(tt.sale_starts_at && { sale_starts_at: new Date(tt.sale_starts_at) }),
            ...(tt.sale_ends_at && { sale_ends_at: new Date(tt.sale_ends_at) }),
          })),
        },
      },
      select: {
        id: true, title: true, slug: true, status: true,
        publishing_fee_fcfa: true, commission_percent: true,
      },
    });

    return reply.status(201).send({
      ...event,
      message: `Événement créé en brouillon. Soumettez-le pour approbation via PATCH /events/${event.id}/submit`,
    });
  });

  /* ============================================================
   * PATCH /events/:id/submit — Soumettre un événement pour approbation
   * ============================================================ */
  app.patch("/:id/submit", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizer_id: true, status: true },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    if (event.organizer_id !== userId) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    if (!["draft", "rejected"].includes(event.status)) {
      return reply.status(409).send({
        error: `Un événement en statut "${event.status}" ne peut pas être soumis`,
        code: "INVALID_STATUS_TRANSITION",
      });
    }

    await prisma.event.update({
      where: { id },
      data: { status: "pending_approval" },
    });

    return reply.status(200).send({
      message: "Événement soumis pour approbation. Notre équipe vous répond sous 48h.",
      event_id: id,
    });
  });

  /* ============================================================
   * POST /events/bookings — Réserver des billets (utilisateur)
   * ============================================================ */
  app.post("/bookings", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreateBookingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { event_id, ticket_type_id, quantity } = parseResult.data;
    const userId = request.user.sub;

    /* Vérifier l'événement */
    const event = await prisma.event.findUnique({
      where: { id: event_id },
      select: { id: true, status: true, starts_at: true, commission_percent: true },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    if (event.status !== "approved") {
      return reply.status(409).send({
        error: "Cet événement n'est pas encore disponible à la réservation",
        code: "EVENT_NOT_AVAILABLE",
      });
    }

    if (new Date(event.starts_at) < new Date()) {
      return reply.status(409).send({
        error: "Cet événement est passé",
        code: "EVENT_PAST",
      });
    }

    /* Vérifier le type de billet */
    const ticketType = await prisma.eventTicketType.findUnique({
      where: { id: ticket_type_id },
      select: {
        id: true, event_id: true, name: true,
        price_fcfa: true, quantity: true, max_per_order: true,
        sale_starts_at: true, sale_ends_at: true, is_active: true,
      },
    });

    if (!ticketType || ticketType.event_id !== event_id || !ticketType.is_active) {
      return reply.status(404).send({
        error: "Type de billet introuvable ou inactif",
        code: "TICKET_TYPE_NOT_FOUND",
      });
    }

    /* Vérifier la limite par commande */
    if (quantity > ticketType.max_per_order) {
      return reply.status(409).send({
        error: `Maximum ${ticketType.max_per_order} billets par commande`,
        code: "EXCEEDS_MAX_PER_ORDER",
      });
    }

    /* Vérifier la période de vente */
    const now = new Date();
    if (ticketType.sale_starts_at && now < ticketType.sale_starts_at) {
      return reply.status(409).send({
        error: "La vente de ce billet n'a pas encore commencé",
        code: "SALE_NOT_STARTED",
      });
    }
    if (ticketType.sale_ends_at && now > ticketType.sale_ends_at) {
      return reply.status(409).send({
        error: "La vente de ce billet est terminée",
        code: "SALE_ENDED",
      });
    }

    /* Vérifier les places disponibles */
    const sold = await prisma.eventBooking.aggregate({
      where: {
        ticket_type_id,
        status: { in: ["pending", "confirmed", "checked_in"] },
      },
      _sum: { quantity: true },
    });
    const soldCount = sold._sum.quantity ?? 0;
    const available = ticketType.quantity - soldCount;

    if (available < quantity) {
      return reply.status(409).send({
        error: `Il ne reste que ${available} billet(s) disponible(s)`,
        code: "INSUFFICIENT_TICKETS",
        details: { available, requested: quantity },
      });
    }

    /* Calculer les montants */
    const totalAmount = ticketType.price_fcfa * quantity;
    const commissionFcfa = Math.round(totalAmount * (event.commission_percent / 100));

    /* Créer la réservation */
    const booking = await prisma.eventBooking.create({
      data: {
        user_id: userId,
        event_id,
        ticket_type_id,
        quantity,
        unit_price_fcfa: ticketType.price_fcfa,
        total_amount: totalAmount,
        commission_fcfa: commissionFcfa,
        status: "pending",
        qr_code: "pending", /* Mis à jour juste après avec le vrai ID */
      },
      select: { id: true },
    });

    /* Générer le QR code avec le vrai ID */
    const qrCode = generateEventQr(
      booking.id,
      event_id,
      userId,
      ticketType.name,
      quantity
    );

    await prisma.eventBooking.update({
      where: { id: booking.id },
      data: { qr_code: qrCode },
    });

    return reply.status(201).send({
      booking_id: booking.id,
      event_id,
      ticket_type: ticketType.name,
      quantity,
      total_amount: totalAmount,
      commission_fcfa: commissionFcfa,
      status: "pending",
      message: "Réservation créée. Finalisez le paiement pour confirmer votre billet.",
    });
  });

  /* ============================================================
   * ADMIN : PATCH /events/:id/approve — Approuver un événement
   * ============================================================ */
  app.patch("/:id/approve", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    if (event.status !== "pending_approval") {
      return reply.status(409).send({
        error: `Impossible d'approuver un événement en statut "${event.status}"`,
        code: "INVALID_STATUS",
      });
    }

    await prisma.event.update({
      where: { id },
      data: {
        status: "approved",
        approved_by: request.user.sub,
        approved_at: new Date(),
      },
    });

    return reply.status(200).send({ message: "Événement approuvé", event_id: id });
  });

  /* ============================================================
   * ADMIN : PATCH /events/:id/reject — Rejeter avec raison
   * ============================================================ */
  app.patch("/:id/reject", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const parseResult = RejectEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: parseResult.error.errors[0]?.message,
        code: "VALIDATION_ERROR",
      });
    }

    await prisma.event.update({
      where: { id },
      data: { status: "rejected", rejection_reason: parseResult.data.reason },
    });

    return reply.status(200).send({
      message: "Événement rejeté. L'organisateur sera notifié.",
      event_id: id,
    });
  });

  /* ============================================================
   * ADMIN : PATCH /events/:id/pricing — Modifier les tarifs VIVRE
   * Utilisé quand un accord commercial a été négocié avec l'organisateur.
   * ============================================================ */
  app.patch("/:id/pricing", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const parseResult = PricingUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { publishing_fee_fcfa, commission_percent } = parseResult.data;

    await prisma.event.update({
      where: { id },
      data: {
        ...(publishing_fee_fcfa !== undefined && { publishing_fee_fcfa }),
        ...(commission_percent !== undefined && { commission_percent }),
      },
    });

    return reply.status(200).send({
      message: "Tarifs mis à jour",
      event_id: id,
      publishing_fee_fcfa,
      commission_percent,
    });
  });

  /* ============================================================
   * ADMIN : POST /events/:id/notify-police — Marquer comme notifié à la police
   * Protège VIVRE contre toute responsabilité lors d'incidents de sécurité.
   * En production : envoyer un email automatique à la direction régionale
   * de la police ou à la gendarmerie nationale du Burkina Faso.
   * ============================================================ */
  app.post("/:id/notify-police", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true, title: true, status: true, police_notified_at: true,
        starts_at: true, ends_at: true,
        venue_name: true, venue_address: true, latitude: true, longitude: true,
        max_capacity: true, safety_description: true, expected_profile: true,
        organizer: { select: { first_name: true, last_name: true, phone: true, email: true } },
        city: { select: { name: true } },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    await prisma.event.update({
      where: { id },
      data: { police_notified_at: new Date() },
    });

    /*
     * En production : envoyer l'email/SMS au contact police configuré en base.
     * Pour le MVP, le rapport est disponible via GET /events/:id/police-report.
     * L'admin peut copier le rapport et l'envoyer manuellement.
     */

    return reply.status(200).send({
      message: "Événement marqué comme notifié aux autorités",
      event_id: id,
      notified_at: new Date().toISOString(),
    });
  });

  /* ============================================================
   * ADMIN : GET /events/:id/police-report — Rapport pour les autorités
   * Retourne les données structurées de l'événement pour transmission
   * à la police, gendarmerie ou mairie.
   * ============================================================ */
  app.get("/:id/police-report", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, status: true,
        starts_at: true, ends_at: true,
        venue_name: true, venue_address: true, latitude: true, longitude: true,
        max_capacity: true, safety_description: true, expected_profile: true,
        police_notified_at: true, created_at: true,
        organizer: {
          select: {
            id: true, first_name: true, last_name: true,
            phone: true, email: true,
          },
        },
        city: { select: { name: true, region: true } },
        category: { select: { name: true } },
        ticket_types: {
          select: { name: true, quantity: true, price_fcfa: true },
        },
        _count: { select: { bookings: { where: { status: { in: ["confirmed", "checked_in"] } } } } },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: "Événement introuvable", code: "EVENT_NOT_FOUND" });
    }

    /*
     * Rapport structuré conforme aux standards de déclaration
     * de rassemblement au Burkina Faso.
     * Ce rapport peut être imprimé ou transmis par email à la DCSP,
     * à la brigade de gendarmerie, ou à la mairie de la ville.
     */
    return reply.status(200).send({
      rapport_date: new Date().toISOString(),
      platform: "VIVRE — Plateforme numérique Burkina Faso",

      evenement: {
        titre: event.title,
        categorie: event.category.name,
        date_debut: event.starts_at.toISOString(),
        date_fin: event.ends_at.toISOString(),
        lieu: event.venue_name,
        adresse: event.venue_address,
        coordonnees_gps: event.latitude
          ? { latitude: event.latitude, longitude: event.longitude }
          : null,
        ville: event.city.name,
        region: event.city.region,
        capacite_maximale: event.max_capacity,
        billets_vendus_confirmes: event._count.bookings,
        profil_public_attendu: event.expected_profile ?? "Non précisé",
      },

      securite: {
        plan_securite: event.safety_description ?? "Non fourni par l'organisateur",
        statut_notification_police: event.police_notified_at
          ? `Notifié le ${event.police_notified_at.toISOString()}`
          : "Non encore notifié",
      },

      organisateur: {
        nom: [event.organizer.first_name, event.organizer.last_name].filter(Boolean).join(" "),
        telephone: event.organizer.phone,
        email: event.organizer.email ?? "Non fourni",
        id_plateforme: event.organizer.id,
      },

      types_billets: event.ticket_types.map((tt) => ({
        type: tt.name,
        quantite: tt.quantity,
        prix_fcfa: tt.price_fcfa,
      })),
    });
  });
};
