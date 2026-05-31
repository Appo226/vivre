/**
 * routes/properties/index.ts — Module Hébergement (Étape 6)
 *
 * Endpoints publics :
 *   GET  /properties                — Liste / exploration (sans dates)
 *   POST /properties/search         — Recherche avec disponibilité par dates
 *   GET  /properties/:id            — Détail propriété + chambres + disponibilité
 *
 * Endpoints fournisseur (auth) :
 *   POST /properties                — Créer une propriété (→ pending approval)
 *   GET  /properties/mine           — Mes propriétés (owner)
 *
 * Endpoints admin (auth + rôle admin) :
 *   PATCH /properties/:id/approve   — Approuver une propriété
 *
 * Endpoints réservation (auth) :
 *   POST /property-bookings             — Réserver une chambre
 *   GET  /property-bookings/me          — Mes réservations
 *   GET  /property-bookings/:id         — Détail réservation
 *   DELETE /property-bookings/:id       — Annuler réservation
 *
 * Logique de disponibilité :
 *   Pour une période [checkin, checkout], une chambre est occupée si une
 *   réservation existante vérifie : check_in_date < checkout AND check_out_date > checkin.
 *   Chambres disponibles = quantity - COUNT(réservations qui se chevauchent).
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import {
  PropertySearchSchema,
  PropertiesListSchema,
  CreatePropertySchema,
  CreateBookingSchema,
} from "../../schemas/property.schema.js";
import { notifyPropertyBookingStatus } from "../../services/notification.service.js";

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Calcule le nombre de nuits entre deux dates YYYY-MM-DD.
 * Retourne 0 si checkout <= checkin (dates invalides).
 */
function calcNights(checkin: string, checkout: string): number {
  const d1 = new Date(checkin);
  const d2 = new Date(checkout);
  const diff = Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Compte les réservations qui se chevauchent avec la période demandée,
 * pour un type de chambre donné. Exclut les statuts annulés.
 *
 * Chevauchement : check_in_date < checkout AND check_out_date > checkin.
 * (Propriété des intervalles — si A se chevauche avec B :
 *  A.start < B.end AND A.end > B.start)
 */
async function countOverlappingBookings(
  roomTypeId: string,
  checkin: string,
  checkout: string
): Promise<number> {
  const count = await prisma.propertyBooking.count({
    where: {
      room_type_id: roomTypeId,
      status: { in: ["pending", "confirmed", "checked_in"] },
      /*
       * Prisma n'a pas d'opérateur de chevauchement direct sur strings YYYY-MM-DD.
       * On filtre : la réservation commence AVANT notre checkout
       *             ET la réservation finit APRES notre checkin.
       * Les dates YYYY-MM-DD se comparent correctement en ordre lexicographique.
       */
      check_in_date: { lt: checkout },
      check_out_date: { gt: checkin },
    },
  });
  return count;
}

/**
 * Vérifie qu'un utilisateur est bien le propriétaire d'une property.
 * Retourne la property si oui, null sinon.
 */
async function getOwnedProperty(propertyId: string, userId: string) {
  return prisma.property.findFirst({
    where: { id: propertyId, owner_id: userId, deleted_at: null },
    select: { id: true },
  });
}

/* ============================================================
 * ROUTES PROPRIÉTÉS
 * ============================================================ */

export const propertiesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /properties/mine — Mes propriétés (fournisseur)
   * Déclaré avant /:id pour éviter que "mine" soit interprété comme UUID.
   * ============================================================ */
  app.get("/mine", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const properties = await prisma.property.findMany({
      where: { owner_id: userId, deleted_at: null },
      select: {
        id: true, name: true, property_type: true, address: true,
        star_rating: true, rating_avg: true, is_approved: true, is_active: true,
        city: { select: { name: true } },
        _count: { select: { room_types: true, bookings: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return reply.status(200).send({ properties });
  });

  /* ============================================================
   * GET /properties — Liste simple pour exploration
   * Public — affiche toutes les propriétés approuvées d'une ville.
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = PropertiesListSchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, property_type, q, min_stars, page, limit } = parseResult.data;
    const offset = (page - 1) * limit;

    const where = {
      is_approved: true,
      is_active: true,
      deleted_at: null,
      ...(city_id && { city_id }),
      ...(property_type && { property_type }),
      ...(min_stars && { star_rating: { gte: min_stars } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { address: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        select: {
          id: true, name: true, property_type: true, address: true,
          latitude: true, longitude: true, star_rating: true,
          rating_avg: true, amenities: true, check_in_time: true, check_out_time: true,
          city: { select: { id: true, name: true } },
          room_types: {
            where: { is_active: true },
            select: { price_per_night: true },
            orderBy: { price_per_night: "asc" },
            take: 1, /* Prix minimum pour affichage "à partir de" */
          },
        },
        orderBy: [{ rating_avg: "desc" }, { name: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.property.count({ where }),
    ]);

    return reply.status(200).send({
      properties: properties.map((p) => ({
        ...p,
        min_price_per_night: p.room_types[0]?.price_per_night ?? null,
        room_types: undefined, /* Masquer le champ brut */
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * POST /properties/search — Recherche avec disponibilité par dates
   * Le plus important : filtre les propriétés qui ont au moins une chambre
   * disponible pour les dates demandées avec la capacité suffisante.
   * ============================================================ */
  app.post("/search", async (request, reply) => {
    const parseResult = PropertySearchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Paramètres de recherche invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { city_id, checkin, checkout, guests, property_type, max_price, min_stars, amenities, page, limit } =
      parseResult.data;
    const offset = (page - 1) * limit;

    /* Valider les dates */
    if (checkin >= checkout) {
      return reply.status(422).send({
        error: "La date de départ doit être après la date d'arrivée",
        code: "INVALID_DATES",
      });
    }

    const nights = calcNights(checkin, checkout);
    if (nights <= 0) {
      return reply.status(422).send({ error: "Dates invalides", code: "INVALID_DATES" });
    }

    /* Filtres sur les propriétés */
    const amenityList = amenities?.split(",").map((a) => a.trim()).filter(Boolean) ?? [];

    const baseWhere = {
      city_id,
      is_approved: true,
      is_active: true,
      deleted_at: null,
      ...(property_type && { property_type }),
      ...(min_stars && { star_rating: { gte: min_stars } }),
      /*
       * Filtrer par équipements requis.
       * Prisma n'a pas d'opérateur "contient tous les éléments" pour String[].
       * On utilise hasEvery pour les tableaux.
       */
      ...(amenityList.length > 0 && { amenities: { hasEvery: amenityList } }),
    };

    /* Récupérer toutes les propriétés correspondantes avec leurs chambres */
    const properties = await prisma.property.findMany({
      where: baseWhere,
      select: {
        id: true, name: true, property_type: true, address: true,
        latitude: true, longitude: true, star_rating: true,
        rating_avg: true, amenities: true, check_in_time: true, check_out_time: true,
        cancellation_policy: true,
        city: { select: { id: true, name: true } },
        room_types: {
          where: {
            is_active: true,
            max_occupancy: { gte: guests }, /* Chambres avec capacité suffisante */
            ...(max_price && { price_per_night: { lte: max_price } }),
          },
          select: {
            id: true, name: true, max_occupancy: true, bed_type: true,
            price_per_night: true, quantity: true, amenities: true,
          },
        },
      },
      orderBy: [{ rating_avg: "desc" }],
    });

    /*
     * Pour chaque propriété, calculer la disponibilité réelle de chaque chambre.
     * C'est l'étape la plus critique : on exclut les propriétés sans chambre disponible.
     */
    const resultsWithAvailability = await Promise.all(
      properties.map(async (prop) => {
        const roomsWithAvailability = await Promise.all(
          prop.room_types.map(async (rt) => {
            const booked = await countOverlappingBookings(rt.id, checkin, checkout);
            const available = Math.max(0, rt.quantity - booked);
            return { ...rt, available, booked };
          })
        );

        /* N'inclure que les chambres effectivement disponibles */
        const availableRooms = roomsWithAvailability.filter((r) => r.available > 0);
        if (availableRooms.length === 0) return null; /* Propriété pleine pour ces dates */

        const minPrice = Math.min(...availableRooms.map((r) => r.price_per_night));

        return {
          id: prop.id,
          name: prop.name,
          property_type: prop.property_type,
          address: prop.address,
          latitude: prop.latitude,
          longitude: prop.longitude,
          star_rating: prop.star_rating,
          rating_avg: prop.rating_avg,
          amenities: prop.amenities,
          check_in_time: prop.check_in_time,
          check_out_time: prop.check_out_time,
          cancellation_policy: prop.cancellation_policy,
          city: prop.city,
          min_price_per_night: minPrice,
          total_for_stay: minPrice * nights,
          nights,
          available_room_types: availableRooms,
        };
      })
    );

    const available = resultsWithAvailability.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );

    /* Pagination après filtrage (car on ne peut pas paginer en SQL avant le calcul de dispo) */
    const paginated = available.slice(offset, offset + limit);

    return reply.status(200).send({
      properties: paginated,
      total: available.length,
      page,
      pages: Math.ceil(available.length / limit),
      search_params: { checkin, checkout, nights, guests },
    });
  });

  /* ============================================================
   * GET /properties/:id — Détail d'une propriété
   * Accepte les paramètres checkin/checkout en query string pour
   * calculer la disponibilité en temps réel.
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const checkin = query["checkin"];
    const checkout = query["checkout"];
    const guests = parseInt(query["guests"] ?? "1", 10);

    const property = await prisma.property.findFirst({
      where: { id, is_approved: true, is_active: true, deleted_at: null },
      select: {
        id: true, name: true, property_type: true, description: true,
        address: true, latitude: true, longitude: true,
        phone: true, email: true, star_rating: true, amenities: true,
        check_in_time: true, check_out_time: true, cancellation_policy: true,
        rating_avg: true, is_active: true,
        city: { select: { id: true, name: true, latitude: true, longitude: true } },
        owner: { select: { first_name: true, last_name: true, phone: true } },
        room_types: {
          where: { is_active: true },
          select: {
            id: true, name: true, description: true, max_occupancy: true,
            bed_type: true, price_per_night: true, quantity: true, amenities: true,
          },
          orderBy: { price_per_night: "asc" },
        },
      },
    });

    if (!property) {
      return reply.status(404).send({ error: "Hébergement introuvable", code: "PROPERTY_NOT_FOUND" });
    }

    /* Si des dates sont fournies, calculer la disponibilité de chaque chambre */
    let roomsWithAvailability: (typeof property.room_types[number] & {
      available?: number;
      total_for_stay?: number;
    })[] = property.room_types;

    let nights = 0;

    if (checkin && checkout && checkin < checkout) {
      nights = calcNights(checkin, checkout);
      roomsWithAvailability = await Promise.all(
        property.room_types.map(async (rt) => {
          const booked = await countOverlappingBookings(rt.id, checkin, checkout);
          const available = Math.max(0, rt.quantity - booked);

          /* Filtrer par capacité si guests spécifié */
          if (rt.max_occupancy < guests) return { ...rt, available: 0, total_for_stay: 0 };

          return {
            ...rt,
            available,
            total_for_stay: rt.price_per_night * nights,
          };
        })
      );
    }

    return reply.status(200).send({
      ...property,
      room_types: roomsWithAvailability,
      nights: nights > 0 ? nights : undefined,
      search_params: checkin && checkout ? { checkin, checkout, guests } : undefined,
    });
  });

  /* ============================================================
   * POST /properties — Créer une propriété (fournisseur)
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreatePropertySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const data = parseResult.data;
    const userId = request.user.sub;

    const property = await prisma.property.create({
      data: {
        owner_id: userId,
        city_id: data.city_id,
        name: data.name,
        property_type: data.property_type,
        description: data.description ?? null,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        phone: data.phone,
        email: data.email ?? null,
        star_rating: data.star_rating ?? null,
        amenities: data.amenities,
        check_in_time: data.check_in_time,
        check_out_time: data.check_out_time,
        cancellation_policy: data.cancellation_policy ?? null,
        is_approved: false,
        room_types: {
          create: data.room_types.map((rt) => ({
            name: rt.name,
            description: rt.description ?? null,
            max_occupancy: rt.max_occupancy,
            bed_type: rt.bed_type,
            price_per_night: rt.price_per_night,
            quantity: rt.quantity,
            amenities: rt.amenities,
          })),
        },
      },
      select: {
        id: true, name: true, property_type: true, is_approved: true,
      },
    });

    return reply.status(201).send({
      ...property,
      message: "Propriété créée — en attente de validation par notre équipe (48h).",
    });
  });

  /* ============================================================
   * PATCH /properties/:id — Modifier les infos de la propriété (owner)
   * ============================================================ */
  app.patch("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedProperty(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const body = request.body as Record<string, unknown>;
    const updatable: Record<string, unknown> = {};

    if (typeof body["name"] === "string") updatable["name"] = body["name"];
    if (typeof body["description"] === "string") updatable["description"] = body["description"];
    if (typeof body["phone"] === "string") updatable["phone"] = body["phone"];
    if (typeof body["email"] === "string") updatable["email"] = body["email"];
    if (typeof body["address"] === "string") updatable["address"] = body["address"];
    if (typeof body["check_in_time"] === "string") updatable["check_in_time"] = body["check_in_time"];
    if (typeof body["check_out_time"] === "string") updatable["check_out_time"] = body["check_out_time"];
    if (typeof body["cancellation_policy"] === "string") updatable["cancellation_policy"] = body["cancellation_policy"];
    if (Array.isArray(body["amenities"])) updatable["amenities"] = body["amenities"];
    /* Politique structurée d'annulation */
    const validPolicies = ["flexible", "moderate", "strict", "non_refundable"];
    if (typeof body["cancel_policy"] === "string" && validPolicies.includes(body["cancel_policy"])) {
      updatable["cancel_policy"] = body["cancel_policy"];
    }
    if (typeof body["cancel_full_refund_h"] === "number") updatable["cancel_full_refund_h"] = body["cancel_full_refund_h"];
    if (typeof body["cancel_partial_h"] === "number") updatable["cancel_partial_h"] = body["cancel_partial_h"];
    if (typeof body["cancel_partial_pct"] === "number") updatable["cancel_partial_pct"] = body["cancel_partial_pct"];

    if (Object.keys(updatable).length === 0) {
      return reply.status(422).send({ error: "Aucun champ à modifier", code: "VALIDATION_ERROR" });
    }

    const property = await prisma.property.update({
      where: { id },
      data: updatable,
      select: {
        id: true, name: true, phone: true, email: true, description: true, address: true,
        check_in_time: true, check_out_time: true, cancellation_policy: true, amenities: true,
      },
    });

    return reply.status(200).send({ message: "Propriété mise à jour", property });
  });

  /* ============================================================
   * GET /properties/:id/bookings — Réservations de la propriété (owner/admin)
   * Dashboard fournisseur — liste paginée avec filtre statut.
   * ============================================================ */
  app.get("/:id/bookings", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedProperty(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const query = request.query as Record<string, string>;
    const status = query["status"]; /* pending | confirmed | checked_in | completed | cancelled */
    const page  = parseInt(query["page"] ?? "1", 10);
    const limit = 20;

    const [bookings, total] = await Promise.all([
      prisma.propertyBooking.findMany({
        where: {
          property_id: id,
          ...(status ? { status } : {}),
        },
        select: {
          id: true, check_in_date: true, check_out_date: true,
          nights_count: true, guests_count: true, total_amount: true,
          status: true, special_requests: true, created_at: true,
          user: { select: { first_name: true, last_name: true, phone: true } },
          room_type: { select: { name: true, bed_type: true } },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.propertyBooking.count({
        where: { property_id: id, ...(status ? { status } : {}) },
      }),
    ]);

    return reply.status(200).send({
      bookings: bookings.map((b) => ({ ...b, created_at: b.created_at.toISOString() })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * PATCH /properties/:id/approve — Approuver une propriété (admin)
   * ============================================================ */
  app.patch("/:id/approve", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    await prisma.property.update({
      where: { id },
      data: { is_approved: true },
    });

    return reply.status(200).send({ message: "Propriété approuvée", property_id: id });
  });
};

/* ============================================================
 * ROUTES RÉSERVATIONS — séparées pour préfixe différent (/property-bookings)
 * ============================================================ */

export const propertyBookingsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /property-bookings/me — Mes réservations
   * Déclaré avant /:id.
   * ============================================================ */
  app.get("/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const filter = (request.query as Record<string, string>)["filter"] ?? "all";
    const page = parseInt((request.query as Record<string, string>)["page"] ?? "1", 10);
    const limit = 10;
    const offset = (page - 1) * limit;
    const today = new Date().toISOString().split("T")[0] as string;

    type WhereFilter = {
      user_id: string;
      status?: string | { in: string[] };
      check_in_date?: { gte?: string; lt?: string };
    };

    const where: WhereFilter = { user_id: userId };
    if (filter === "upcoming") {
      where.check_in_date = { gte: today };
      where.status = { in: ["pending", "confirmed"] };
    } else if (filter === "past") {
      where.check_in_date = { lt: today };
    } else if (filter === "cancelled") {
      where.status = "cancelled";
    }

    const [bookings, total] = await Promise.all([
      prisma.propertyBooking.findMany({
        where,
        select: {
          id: true, check_in_date: true, check_out_date: true,
          nights_count: true, guests_count: true, total_amount: true,
          status: true, created_at: true,
          room_type: { select: { name: true, bed_type: true, price_per_night: true } },
          property: {
            select: {
              id: true, name: true, property_type: true, star_rating: true,
              address: true, phone: true,
              city: { select: { name: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.propertyBooking.count({ where }),
    ]);

    return reply.status(200).send({
      bookings: bookings.map((b) => ({
        ...b,
        created_at: b.created_at.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /property-bookings/:id — Détail d'une réservation
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.propertyBooking.findUnique({
      where: { id },
      select: {
        id: true, user_id: true, check_in_date: true, check_out_date: true,
        nights_count: true, guests_count: true, total_amount: true,
        special_requests: true, status: true, cancelled_at: true, created_at: true,
        room_type: {
          select: {
            id: true, name: true, description: true, bed_type: true,
            max_occupancy: true, price_per_night: true, amenities: true,
          },
        },
        property: {
          select: {
            id: true, name: true, property_type: true, star_rating: true,
            address: true, latitude: true, longitude: true,
            phone: true, email: true,
            check_in_time: true, check_out_time: true, cancellation_policy: true,
            amenities: true,
            city: { select: { name: true } },
          },
        },
      },
    });

    if (!booking) {
      return reply.status(404).send({ error: "Réservation introuvable", code: "BOOKING_NOT_FOUND" });
    }

    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    return reply.status(200).send({
      ...booking,
      cancelled_at: booking.cancelled_at?.toISOString(),
      created_at: booking.created_at.toISOString(),
    });
  });

  /* ============================================================
   * POST /property-bookings — Réserver une chambre
   * ============================================================ */
  app.post("/", async (request, reply) => {
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

    const { property_id, room_type_id, checkin, checkout, guests, special_requests } = parseResult.data;
    const userId = request.user.sub;

    /* Valider les dates */
    if (checkin >= checkout) {
      return reply.status(422).send({
        error: "La date de départ doit être après la date d'arrivée",
        code: "INVALID_DATES",
      });
    }

    const today = new Date().toISOString().split("T")[0] as string;
    if (checkin < today) {
      return reply.status(422).send({
        error: "La date d'arrivée ne peut pas être dans le passé",
        code: "DATE_IN_PAST",
      });
    }

    const nights = calcNights(checkin, checkout);

    /* Vérifier que la propriété et la chambre existent et sont compatibles */
    const roomType = await prisma.roomType.findUnique({
      where: { id: room_type_id },
      select: {
        id: true, property_id: true, name: true,
        max_occupancy: true, price_per_night: true, quantity: true, is_active: true,
      },
    });

    if (!roomType || roomType.property_id !== property_id || !roomType.is_active) {
      return reply.status(404).send({
        error: "Chambre introuvable ou inactive",
        code: "ROOM_NOT_FOUND",
      });
    }

    if (guests > roomType.max_occupancy) {
      return reply.status(422).send({
        error: `Cette chambre accueille maximum ${roomType.max_occupancy} personne(s)`,
        code: "EXCEEDS_CAPACITY",
      });
    }

    /* Vérifier la disponibilité pour les dates demandées */
    const booked = await countOverlappingBookings(room_type_id, checkin, checkout);
    const available = roomType.quantity - booked;

    if (available <= 0) {
      return reply.status(409).send({
        error: "Aucune chambre de ce type n'est disponible pour ces dates",
        code: "NO_AVAILABILITY",
        details: { checkin, checkout },
      });
    }

    const totalAmount = roomType.price_per_night * nights;

    const booking = await prisma.propertyBooking.create({
      data: {
        user_id: userId,
        property_id,
        room_type_id,
        check_in_date: checkin,
        check_out_date: checkout,
        nights_count: nights,
        guests_count: guests,
        total_amount: totalAmount,
        special_requests: special_requests ?? null,
        status: "pending",
      },
      select: {
        id: true, check_in_date: true, check_out_date: true,
        nights_count: true, total_amount: true, status: true,
      },
    });

    return reply.status(201).send({
      ...booking,
      room_type_name: roomType.name,
      message: "Réservation créée — finalisez le paiement pour confirmer votre chambre.",
    });
  });

  /* ============================================================
   * PATCH /property-bookings/:id/status — Mettre à jour le statut (owner)
   * Transitions autorisées :
   *   confirmed  → checked_in  (client arrivé)
   *   checked_in → completed   (client parti)
   *   pending    → cancelled   (refus par l'hôtel)
   *   confirmed  → cancelled   (refus exceptionnel)
   * ============================================================ */
  app.patch("/:id/status", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    const userId = request.user.sub;

    const booking = await prisma.propertyBooking.findUnique({
      where: { id },
      select: {
        id: true, status: true, property_id: true, user_id: true,
        user:     { select: { phone: true } },
        property: { select: { name: true } },
      },
    });

    if (!booking) {
      return reply.status(404).send({ error: "Réservation introuvable", code: "BOOKING_NOT_FOUND" });
    }

    /* Vérifier que le demandeur possède cet hébergement */
    const owned = await getOwnedProperty(booking.property_id, userId);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      confirmed:  ["checked_in", "cancelled"],
      checked_in: ["completed"],
      pending:    ["confirmed", "cancelled"],
    };

    if (!VALID_TRANSITIONS[booking.status]?.includes(status)) {
      return reply.status(409).send({
        error: `Transition ${booking.status} → ${status} non autorisée`,
        code: "INVALID_TRANSITION",
      });
    }

    await prisma.propertyBooking.update({
      where: { id },
      data: {
        status,
        ...(status === "cancelled" ? { cancelled_at: new Date() } : {}),
      },
    });

    /* Notifier le client sur les transitions importantes (confirmation / annulation par l'hôtel) */
    if ((status === "confirmed" || status === "cancelled") && booking.user) {
      void notifyPropertyBookingStatus({
        userId:       booking.user_id,
        userPhone:    booking.user.phone,
        bookingId:    id,
        propertyName: booking.property.name,
        status:       status as "confirmed" | "cancelled",
      });
    }

    return reply.status(200).send({ message: "Statut mis à jour", booking_id: id, status });
  });

  /* ============================================================
   * DELETE /property-bookings/:id — Annuler une réservation
   * ============================================================ */
  app.delete("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.propertyBooking.findUnique({
      where: { id },
      select: {
        id: true, user_id: true, status: true, check_in_date: true,
      },
    });

    if (!booking) {
      return reply.status(404).send({ error: "Réservation introuvable", code: "BOOKING_NOT_FOUND" });
    }

    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return reply.status(409).send({
        error: `Réservation déjà ${booking.status === "cancelled" ? "annulée" : "terminée"}`,
        code: "INVALID_STATUS",
      });
    }

    /* Politique : annulation impossible si check-in dans moins de 24h */
    const checkinDate = new Date(booking.check_in_date);
    const deadline = new Date(checkinDate);
    deadline.setHours(deadline.getHours() - 24);

    if (new Date() > deadline) {
      return reply.status(409).send({
        error: "Annulation impossible moins de 24h avant le check-in",
        code: "CANCELLATION_TOO_LATE",
        details: { check_in: booking.check_in_date },
      });
    }

    await prisma.propertyBooking.update({
      where: { id },
      data: { status: "cancelled", cancelled_at: new Date() },
    });

    return reply.status(200).send({ message: "Réservation annulée", booking_id: id });
  });
};
