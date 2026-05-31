/**
 * routes/transport/index.ts — Module Transport Interurbain (Étape 5)
 *
 * Endpoints :
 *   POST /transport/search          — Recherche de voyages disponibles (public)
 *   GET  /transport/companies       — Liste des compagnies actives (public)
 *   GET  /transport/trips/:id       — Détail d'un trip + plan de sièges (public)
 *   POST /transport/bookings        — Créer une réservation (auth)
 *   GET  /transport/bookings/me     — Mes réservations (auth)
 *   GET  /transport/bookings/:id    — Détail d'une réservation (auth)
 *   DELETE /transport/bookings/:id  — Annuler une réservation (auth)
 *
 * Flux de réservation (sans paiement pour le MVP) :
 *   1. POST /search → liste des trips disponibles
 *   2. GET /trips/:id → plan de sièges
 *   3. POST /bookings → réservation créée (status: "pending")
 *   4. Le module Paiements (Étape 13) confirmera via PATCH /bookings/:id/confirm
 *
 * Logique de génération des trips :
 *   Les Trips sont des instances concrètes de Schedules.
 *   Lors d'une recherche, on génère "lazily" les trips pour la date demandée
 *   à partir des schedules actifs qui tournent ce jour de la semaine.
 *   Cela évite de pré-générer des milliers de trips en avance.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import {
  TransportSearchSchema,
  CreateBookingSchema,
  CancelBookingSchema,
  BookingsQuerySchema,
} from "../../schemas/transport.schema.js";

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Génère un plan de sièges à partir du nombre total de places et du type de bus.
 *
 * Formats selon le type :
 *   standard / confort : 4 sièges par rangée (A|B | allée | C|D)
 *   vip                : 3 sièges par rangée (A | allée | B|C)
 *   minibus            : 4 sièges par rangée, moins de rangées
 *
 * @param totalSeats  Nombre total de places dans le bus
 * @param busType     Type de bus (standard|confort|vip|minibus)
 * @param takenSeats  Numéros de sièges déjà réservés (ex: ["1A", "3C"])
 */
function generateSeatMap(
  totalSeats: number,
  busType: string,
  takenSeats: string[]
): {
  seats: { number: string; status: "available" | "occupied"; row: number; col: number }[];
  layout: { rows: number; cols: number; aisle_after_col: number };
} {
  const takenSet = new Set(takenSeats);

  /* VIP : 3 sièges/rangée (colonnes A, B, C — allée après A) */
  const isVip = busType === "vip";
  const colsPerRow = isVip ? 3 : 4;
  const colLabels = isVip ? ["A", "B", "C"] : ["A", "B", "C", "D"];
  const aisleAfterCol = isVip ? 1 : 2; /* allée après A (vip) ou après B (standard/confort/minibus) */

  const rows = Math.ceil(totalSeats / colsPerRow);
  const seats: { number: string; status: "available" | "occupied"; row: number; col: number }[] = [];

  for (let row = 1; row <= rows; row++) {
    for (let colIdx = 0; colIdx < colsPerRow; colIdx++) {
      const seatNumber = `${row}${colLabels[colIdx]}`;
      seats.push({
        number: seatNumber,
        status: takenSet.has(seatNumber) ? "occupied" : "available",
        row,
        col: colIdx + 1,
      });
    }
  }

  return {
    seats,
    layout: { rows, cols: colsPerRow, aisle_after_col: aisleAfterCol },
  };
}

/**
 * Encode les données d'un billet en base64 pour le QR code.
 * Le format est intentionnellement compact pour que le QR soit lisible.
 *
 * Structure encodée :
 *   { b: bookingId, t: tripId, u: userId, s: seatNumbers, d: departureISO }
 */
function generateQrCode(
  bookingId: string,
  tripId: string,
  userId: string,
  seatNumbers: string[],
  departureIso: string
): string {
  const data = {
    b: bookingId,
    t: tripId,
    u: userId,
    s: seatNumbers,
    d: departureIso,
  };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/**
 * Trouve ou crée le Trip pour une date donnée à partir d'un Schedule.
 *
 * La date cible est combinée avec departure_time et arrival_time du Schedule.
 * Si un Trip existe déjà pour ce (schedule, date), on le retourne.
 * Sinon, on le crée avec available_seats = total_seats de la Route.
 *
 * @param scheduleId  ID du schedule récurrent
 * @param routeId     ID de la route (pour available_seats initial)
 * @param totalSeats  Capacité de la route
 * @param departureTime  Heure de départ "HH:MM"
 * @param arrivalTime    Heure d'arrivée "HH:MM"
 * @param dateStr        Date cible "YYYY-MM-DD"
 */
async function findOrCreateTrip(
  scheduleId: string,
  routeId: string,
  totalSeats: number,
  departureTime: string,
  arrivalTime: string,
  dateStr: string
): Promise<{
  id: string;
  available_seats: number;
  status: string;
  departure_datetime: Date;
  arrival_datetime: Date;
  override_price: number | null;
}> {
  /*
   * Construire les datetimes en supposant le fuseau Burkina Faso (UTC+0, pas de DST).
   * On parse "YYYY-MM-DD" + "HH:MM" → Date UTC (Burkina = UTC±0 toute l'année).
   */
  const departure = new Date(`${dateStr}T${departureTime}:00.000Z`);

  /*
   * Gérer le cas où l'arrivée est le lendemain (ex: départ 22:00, arrivée 02:00).
   * Si l'heure d'arrivée est plus petite que celle de départ, c'est le lendemain.
   */
  const [depH, depM] = departureTime.split(":").map(Number);
  const [arrH, arrM] = arrivalTime.split(":").map(Number);
  const depMinutes = (depH ?? 0) * 60 + (depM ?? 0);
  const arrMinutes = (arrH ?? 0) * 60 + (arrM ?? 0);
  const dayOffset = arrMinutes <= depMinutes ? 1 : 0;

  const arrivalDate = new Date(departure);
  arrivalDate.setDate(arrivalDate.getDate() + dayOffset);
  arrivalDate.setUTCHours(arrH ?? 0, arrM ?? 0, 0, 0);

  /* Chercher un trip existant (même schedule, même date de départ) */
  const existing = await prisma.trip.findFirst({
    where: {
      schedule_id: scheduleId,
      departure_datetime: departure,
    },
    select: {
      id: true,
      available_seats: true,
      status: true,
      departure_datetime: true,
      arrival_datetime: true,
      override_price: true,
    },
  });

  if (existing) return existing;

  /* Créer le trip pour cette date (génération lazy) */
  return prisma.trip.create({
    data: {
      schedule_id: scheduleId,
      route_id: routeId,
      departure_datetime: departure,
      arrival_datetime: arrivalDate,
      available_seats: totalSeats,
      status: "scheduled",
    },
    select: {
      id: true,
      available_seats: true,
      status: true,
      departure_datetime: true,
      arrival_datetime: true,
      override_price: true,
    },
  });
}

/* ============================================================
 * ROUTES
 * ============================================================ */

export const transportRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * POST /transport/search — Recherche de voyages disponibles
   * Public — accessible sans authentification (on peut comparer les prix
   * avant de créer un compte).
   * ============================================================ */
  app.post("/search", async (request, reply) => {
    const parseResult = TransportSearchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Paramètres de recherche invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { origin_city_id, destination_city_id, date, passengers } = parseResult.data;

    /* Vérifier que la date n'est pas dans le passé (plus d'1 jour de tolérance) */
    const searchDate = new Date(date);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (searchDate < yesterday) {
      return reply.status(422).send({
        error: "La date de départ ne peut pas être dans le passé",
        code: "DATE_IN_PAST",
      });
    }

    /*
     * Déterminer le jour de la semaine (1=Lundi...7=Dimanche) pour filtrer
     * les schedules qui tournent ce jour-là.
     * getDay() retourne 0=Dimanche...6=Samedi → conversion vers 1-7.
     */
    const jsDay = searchDate.getDay(); /* 0=dim, 1=lun, ..., 6=sam */
    const isoDay = jsDay === 0 ? 7 : jsDay; /* Convertir dimanche (0→7) */

    /*
     * Trouver les routes actives entre ces deux villes,
     * avec leurs schedules actifs qui tournent ce jour-là.
     */
    const routes = await prisma.route.findMany({
      where: {
        origin_city_id,
        destination_city_id,
        is_active: true,
        deleted_at: null,
        company: {
          is_active: true,
          is_approved: true,
          deleted_at: null,
        },
        schedules: {
          some: {
            is_active: true,
            days_of_week: {
              has: isoDay,
            },
          },
        },
      },
      select: {
        id: true,
        distance_km: true,
        duration_minutes: true,
        bus_type: true,
        total_seats: true,
        company: {
          select: {
            id: true,
            name: true,
            logo_url: true,
            rating_avg: true,
          },
        },
        origin_city: {
          select: { id: true, name: true },
        },
        destination_city: {
          select: { id: true, name: true },
        },
        schedules: {
          where: {
            is_active: true,
            days_of_week: { has: isoDay },
          },
          select: {
            id: true,
            departure_time: true,
            arrival_time: true,
            base_price: true,
            child_price: true,
            student_price: true,
          },
        },
      },
    });

    if (routes.length === 0) {
      return reply.status(200).send({ trips: [], total: 0 });
    }

    /*
     * Pour chaque schedule trouvé, générer (ou retrouver) le Trip concret
     * pour la date demandée. Ensuite filtrer par places disponibles.
     */
    const tripResults = await Promise.all(
      routes.flatMap((route) =>
        route.schedules.map(async (schedule) => {
          const trip = await findOrCreateTrip(
            schedule.id,
            route.id,
            route.total_seats,
            schedule.departure_time,
            schedule.arrival_time,
            date
          );

          /* Exclure les voyages sans assez de places ou déjà partis */
          if (
            trip.available_seats < passengers ||
            trip.status === "departed" ||
            trip.status === "completed" ||
            trip.status === "cancelled"
          ) {
            return null;
          }

          return {
            id: trip.id,
            company: route.company,
            route: {
              origin_city: route.origin_city.name,
              destination_city: route.destination_city.name,
              distance_km: route.distance_km,
              bus_type: route.bus_type,
            },
            departure_datetime: trip.departure_datetime.toISOString(),
            arrival_datetime: trip.arrival_datetime.toISOString(),
            duration_minutes: route.duration_minutes,
            available_seats: trip.available_seats,
            prices: {
              adult: trip.override_price ?? schedule.base_price,
              child: trip.override_price
                ? Math.round(trip.override_price * 0.7)
                : schedule.child_price,
              student: trip.override_price
                ? Math.round(trip.override_price * 0.85)
                : schedule.student_price,
            },
            status: trip.status,
          };
        })
      )
    );

    /* Filtrer les nulls et trier par heure de départ */
    const trips = tripResults
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort(
        (a, b) =>
          new Date(a.departure_datetime).getTime() -
          new Date(b.departure_datetime).getTime()
      );

    return reply.status(200).send({ trips, total: trips.length });
  });

  /* ============================================================
   * GET /transport/companies — Liste des compagnies actives
   * Public — permet à l'utilisateur de filtrer par compagnie préférée.
   * ============================================================ */
  app.get("/companies", async (_request, reply) => {
    const companies = await prisma.transportCompany.findMany({
      where: {
        is_active: true,
        is_approved: true,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        logo_url: true,
        phone: true,
        address: true,
        rating_avg: true,
        total_reviews: true,
        city: {
          select: { id: true, name: true },
        },
      },
      orderBy: { rating_avg: "desc" },
    });

    return reply.status(200).send({ companies });
  });

  /* ============================================================
   * GET /transport/trips/:id — Détail d'un trip avec plan de sièges
   * Public — l'utilisateur peut voir les sièges disponibles avant de s'inscrire.
   * ============================================================ */
  app.get("/trips/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const trip = await prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        available_seats: true,
        status: true,
        departure_datetime: true,
        arrival_datetime: true,
        override_price: true,
        route: {
          select: {
            id: true,
            distance_km: true,
            duration_minutes: true,
            bus_type: true,
            total_seats: true,
            company: {
              select: {
                id: true,
                name: true,
                logo_url: true,
                phone: true,
                address: true,
                rating_avg: true,
              },
            },
            origin_city: {
              select: { id: true, name: true },
            },
            destination_city: {
              select: { id: true, name: true },
            },
          },
        },
        schedule: {
          select: {
            base_price: true,
            child_price: true,
            student_price: true,
          },
        },
        /*
         * Récupérer les sièges déjà réservés (pending ou confirmed).
         * Les réservations annulées libèrent leurs sièges.
         */
        bookings: {
          where: {
            status: { in: ["pending", "confirmed"] },
          },
          select: {
            seat_numbers: true,
          },
        },
      },
    });

    if (!trip) {
      return reply.status(404).send({
        error: "Voyage introuvable",
        code: "TRIP_NOT_FOUND",
      });
    }

    /* Aplatir tous les sièges pris en un seul tableau */
    const takenSeats = trip.bookings.flatMap((b) => b.seat_numbers);

    const seatMap = generateSeatMap(
      trip.route.total_seats,
      trip.route.bus_type,
      takenSeats
    );

    return reply.status(200).send({
      id: trip.id,
      status: trip.status,
      departure_datetime: trip.departure_datetime.toISOString(),
      arrival_datetime: trip.arrival_datetime.toISOString(),
      available_seats: trip.available_seats,
      prices: {
        adult: trip.override_price ?? trip.schedule.base_price,
        child: trip.override_price
          ? Math.round(trip.override_price * 0.7)
          : trip.schedule.child_price,
        student: trip.override_price
          ? Math.round(trip.override_price * 0.85)
          : trip.schedule.student_price,
      },
      company: trip.route.company,
      route: {
        origin_city: trip.route.origin_city.name,
        destination_city: trip.route.destination_city.name,
        distance_km: trip.route.distance_km,
        duration_minutes: trip.route.duration_minutes,
        bus_type: trip.route.bus_type,
      },
      seat_map: seatMap,
    });
  });

  /* ============================================================
   * POST /transport/bookings — Créer une réservation
   * Authentifié — le userId est pris du JWT.
   * Les sièges sont bloqués en "pending" immédiatement.
   * Le module Paiements (Étape 13) confirmera la réservation.
   * ============================================================ */
  app.post("/bookings", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreateBookingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données de réservation invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { trip_id, seat_numbers, passenger_type } = parseResult.data;
    const userId = request.user.sub;

    /* Vérifier que le voyage existe et est réservable */
    const trip = await prisma.trip.findUnique({
      where: { id: trip_id },
      select: {
        id: true,
        available_seats: true,
        status: true,
        departure_datetime: true,
        override_price: true,
        route: {
          select: {
            total_seats: true,
          },
        },
        schedule: {
          select: {
            base_price: true,
            child_price: true,
            student_price: true,
          },
        },
        bookings: {
          where: {
            status: { in: ["pending", "confirmed"] },
          },
          select: { seat_numbers: true },
        },
      },
    });

    if (!trip) {
      return reply.status(404).send({
        error: "Voyage introuvable",
        code: "TRIP_NOT_FOUND",
      });
    }

    /* Refuser si le voyage est déjà parti, annulé ou complet */
    if (["departed", "completed", "cancelled"].includes(trip.status)) {
      return reply.status(409).send({
        error: "Ce voyage n'est plus disponible à la réservation",
        code: "TRIP_NOT_BOOKABLE",
        details: { status: trip.status },
      });
    }

    /* Vérifier que la date de départ est dans le futur */
    if (trip.departure_datetime < new Date()) {
      return reply.status(409).send({
        error: "Ce voyage est déjà parti",
        code: "TRIP_DEPARTED",
      });
    }

    /* Vérifier les places disponibles */
    if (trip.available_seats < seat_numbers.length) {
      return reply.status(409).send({
        error: `Il ne reste que ${trip.available_seats} place(s) disponible(s)`,
        code: "INSUFFICIENT_SEATS",
        details: { available: trip.available_seats, requested: seat_numbers.length },
      });
    }

    /* Vérifier que les sièges demandés ne sont pas déjà pris */
    const takenSeats = new Set(trip.bookings.flatMap((b) => b.seat_numbers));
    const conflictSeats = seat_numbers.filter((s) => takenSeats.has(s));
    if (conflictSeats.length > 0) {
      return reply.status(409).send({
        error: "Certains sièges sont déjà réservés",
        code: "SEATS_UNAVAILABLE",
        details: { conflicting_seats: conflictSeats },
      });
    }

    /* Calculer le montant total selon le type de passager */
    const unitPrice =
      passenger_type === "child"
        ? (trip.override_price ? Math.round(trip.override_price * 0.7) : trip.schedule.child_price)
        : passenger_type === "student"
        ? (trip.override_price ? Math.round(trip.override_price * 0.85) : trip.schedule.student_price)
        : (trip.override_price ?? trip.schedule.base_price);

    const totalAmount = unitPrice * seat_numbers.length;

    /*
     * Créer la réservation.
     * Le qr_code sera mis à jour une fois l'ID connu (après création).
     * On génère un QR code temporaire et on le met à jour immédiatement.
     */
    const booking = await prisma.transportBooking.create({
      data: {
        user_id: userId,
        trip_id,
        passenger_count: seat_numbers.length,
        seat_numbers,
        passenger_type,
        total_amount: totalAmount,
        status: "pending",
        /*
         * QR code placeholder — sera remplacé juste après avec le vrai ID.
         * On ne peut pas connaître l'ID avant la création (UUID auto-généré).
         */
        qr_code: "pending",
      },
      select: {
        id: true,
        seat_numbers: true,
        passenger_count: true,
        passenger_type: true,
        total_amount: true,
        status: true,
        created_at: true,
        trip: {
          select: {
            departure_datetime: true,
          },
        },
      },
    });

    /* Mettre à jour le qr_code avec le vrai ID de la réservation */
    const qrCode = generateQrCode(
      booking.id,
      trip_id,
      userId,
      seat_numbers,
      booking.trip.departure_datetime.toISOString()
    );

    await prisma.transportBooking.update({
      where: { id: booking.id },
      data: { qr_code: qrCode },
    });

    /*
     * Décrémenter le compteur de places disponibles du trip.
     * Note : en production, ce serait un trigger PostgreSQL pour l'atomicité.
     * Pour le MVP, on fait l'update ici (race condition acceptable en dev).
     */
    await prisma.trip.update({
      where: { id: trip_id },
      data: {
        available_seats: { decrement: seat_numbers.length },
      },
    });

    return reply.status(201).send({
      booking_id: booking.id,
      trip_id,
      seat_numbers: booking.seat_numbers,
      passenger_count: booking.passenger_count,
      passenger_type: booking.passenger_type,
      total_amount: booking.total_amount,
      status: booking.status,
      qr_code: qrCode,
      /*
       * Message informatif : l'utilisateur a 10 minutes pour payer.
       * Le module Paiements libèrera les sièges si le timeout expire.
       */
      message: "Réservation créée. Vous avez 10 minutes pour finaliser le paiement.",
    });
  });

  /* ============================================================
   * GET /transport/bookings/me — Mes réservations
   * IMPORTANT : cette route doit être déclarée AVANT /:id pour éviter
   * que Fastify matche "me" comme un ID UUID.
   * ============================================================ */
  app.get("/bookings/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = BookingsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Paramètres invalides",
        code: "VALIDATION_ERROR",
      });
    }

    const { filter, page, limit } = parseResult.data;
    const userId = request.user.sub;
    const offset = (page - 1) * limit;
    const now = new Date();

    /* Construire le filtre Prisma selon le paramètre filter */
    type BookingWhereInput = {
      user_id: string;
      status?: string | { in: string[] };
      trip?: { departure_datetime?: { gt?: Date; lte?: Date } };
    };

    const whereFilter: BookingWhereInput = { user_id: userId };
    if (filter === "upcoming") {
      whereFilter.status = { in: ["pending", "confirmed"] };
      whereFilter.trip = { departure_datetime: { gt: now } };
    } else if (filter === "completed") {
      whereFilter.status = "confirmed";
      whereFilter.trip = { departure_datetime: { lte: now } };
    } else if (filter === "cancelled") {
      whereFilter.status = "cancelled";
    }
    /* filter === "all" → pas de filtre supplémentaire */

    const [bookings, total] = await Promise.all([
      prisma.transportBooking.findMany({
        where: whereFilter,
        select: {
          id: true,
          seat_numbers: true,
          passenger_count: true,
          passenger_type: true,
          total_amount: true,
          status: true,
          created_at: true,
          trip: {
            select: {
              id: true,
              departure_datetime: true,
              arrival_datetime: true,
              status: true,
              route: {
                select: {
                  distance_km: true,
                  duration_minutes: true,
                  bus_type: true,
                  company: {
                    select: { id: true, name: true, logo_url: true },
                  },
                  origin_city: { select: { name: true } },
                  destination_city: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.transportBooking.count({ where: whereFilter }),
    ]);

    return reply.status(200).send({
      bookings: bookings.map((b) => ({
        id: b.id,
        seat_numbers: b.seat_numbers,
        passenger_count: b.passenger_count,
        passenger_type: b.passenger_type,
        total_amount: b.total_amount,
        status: b.status,
        created_at: b.created_at.toISOString(),
        trip: {
          id: b.trip.id,
          departure_datetime: b.trip.departure_datetime.toISOString(),
          arrival_datetime: b.trip.arrival_datetime.toISOString(),
          status: b.trip.status,
          origin_city: b.trip.route.origin_city.name,
          destination_city: b.trip.route.destination_city.name,
          distance_km: b.trip.route.distance_km,
          duration_minutes: b.trip.route.duration_minutes,
          bus_type: b.trip.route.bus_type,
          company: b.trip.route.company,
        },
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /transport/bookings/:id — Détail d'une réservation
   * Inclut le qr_code pour l'affichage du billet numérique.
   * ============================================================ */
  app.get("/bookings/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const booking = await prisma.transportBooking.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        seat_numbers: true,
        passenger_count: true,
        passenger_type: true,
        total_amount: true,
        status: true,
        qr_code: true,
        cancelled_at: true,
        cancellation_reason: true,
        created_at: true,
        trip: {
          select: {
            id: true,
            departure_datetime: true,
            arrival_datetime: true,
            status: true,
            route: {
              select: {
                distance_km: true,
                duration_minutes: true,
                bus_type: true,
                company: {
                  select: {
                    id: true,
                    name: true,
                    logo_url: true,
                    phone: true,
                    address: true,
                  },
                },
                origin_city: { select: { name: true } },
                destination_city: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return reply.status(404).send({
        error: "Réservation introuvable",
        code: "BOOKING_NOT_FOUND",
      });
    }

    /* Vérifier que la réservation appartient à l'utilisateur (ou admin) */
    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({
        error: "Accès refusé",
        code: "AUTH_FORBIDDEN",
      });
    }

    return reply.status(200).send({
      id: booking.id,
      seat_numbers: booking.seat_numbers,
      passenger_count: booking.passenger_count,
      passenger_type: booking.passenger_type,
      total_amount: booking.total_amount,
      status: booking.status,
      qr_code: booking.qr_code,
      cancelled_at: booking.cancelled_at?.toISOString(),
      cancellation_reason: booking.cancellation_reason,
      created_at: booking.created_at.toISOString(),
      trip: {
        id: booking.trip.id,
        departure_datetime: booking.trip.departure_datetime.toISOString(),
        arrival_datetime: booking.trip.arrival_datetime.toISOString(),
        status: booking.trip.status,
        origin_city: booking.trip.route.origin_city.name,
        destination_city: booking.trip.route.destination_city.name,
        distance_km: booking.trip.route.distance_km,
        duration_minutes: booking.trip.route.duration_minutes,
        bus_type: booking.trip.route.bus_type,
        company: booking.trip.route.company,
      },
    });
  });

  /* ============================================================
   * DELETE /transport/bookings/:id — Annuler une réservation
   * Libère les sièges et met le statut à "cancelled".
   * Les remboursements sont gérés par le module Paiements (Étape 13).
   * ============================================================ */
  app.delete("/bookings/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const parseResult = CancelBookingSchema.safeParse(request.body);
    const reason = parseResult.success ? parseResult.data.reason : undefined;

    const booking = await prisma.transportBooking.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        seat_numbers: true,
        status: true,
        trip_id: true,
        trip: {
          select: { departure_datetime: true },
        },
      },
    });

    if (!booking) {
      return reply.status(404).send({
        error: "Réservation introuvable",
        code: "BOOKING_NOT_FOUND",
      });
    }

    if (booking.user_id !== userId && !request.user.roles.includes("admin")) {
      return reply.status(403).send({
        error: "Accès refusé",
        code: "AUTH_FORBIDDEN",
      });
    }

    /* Refuser l'annulation si déjà annulé ou complété */
    if (booking.status === "cancelled") {
      return reply.status(409).send({
        error: "Cette réservation est déjà annulée",
        code: "ALREADY_CANCELLED",
      });
    }

    if (booking.status === "completed") {
      return reply.status(409).send({
        error: "Impossible d'annuler un voyage terminé",
        code: "TRIP_COMPLETED",
      });
    }

    /*
     * Politique d'annulation : refuser si départ dans moins de 2 heures.
     * En production, on vérifierait aussi la politique de la compagnie.
     */
    const twoHoursBeforeDeparture = new Date(booking.trip.departure_datetime);
    twoHoursBeforeDeparture.setHours(twoHoursBeforeDeparture.getHours() - 2);

    if (new Date() > twoHoursBeforeDeparture) {
      return reply.status(409).send({
        error: "Impossible d'annuler moins de 2 heures avant le départ",
        code: "CANCELLATION_TOO_LATE",
        details: {
          departure: booking.trip.departure_datetime.toISOString(),
          deadline: twoHoursBeforeDeparture.toISOString(),
        },
      });
    }

    /* Annuler la réservation et libérer les sièges en parallèle */
    await Promise.all([
      prisma.transportBooking.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelled_at: new Date(),
          ...(reason !== undefined && { cancellation_reason: reason }),
        },
      }),
      prisma.trip.update({
        where: { id: booking.trip_id },
        data: {
          available_seats: { increment: booking.seat_numbers.length },
        },
      }),
    ]);

    return reply.status(200).send({
      message: "Réservation annulée avec succès",
      booking_id: id,
    });
  });

  /* ============================================================
   * PATCH /routes/:id/policy — Politique d'annulation d'une ligne (compagnie)
   * ============================================================ */
  app.patch("/routes/:id/policy", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const { id } = request.params as { id: string };

    /* Vérifier que la ligne appartient à la compagnie de l'utilisateur */
    const route = await prisma.route.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!route) return reply.status(404).send({ error: "Ligne introuvable", code: "NOT_FOUND" });
    if (
      route.company.owner_id !== request.user.sub &&
      !request.user.roles?.includes("admin")
    ) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const { cancel_policy, cancel_full_refund_h, cancel_partial_h, cancel_partial_pct } = z
      .object({
        cancel_policy: z.enum(["flexible", "moderate", "strict", "non_refundable"]),
        cancel_full_refund_h: z.number().int().min(0),
        cancel_partial_h: z.number().int().min(0),
        cancel_partial_pct: z.number().int().min(0).max(100),
      })
      .parse(request.body);

    const updated = await prisma.route.update({
      where: { id },
      data: { cancel_policy, cancel_full_refund_h, cancel_partial_h, cancel_partial_pct },
      select: { id: true, cancel_policy: true, cancel_full_refund_h: true, cancel_partial_h: true, cancel_partial_pct: true },
    });

    return reply.send({ updated: true, policy: updated });
  });
};
