/**
 * routes/rides/index.ts — Transport Intraurbain VIVRE (Taxi / Zémidjan)
 *
 * Flux client :
 *   GET  /rides/estimate                — Estimation du prix avant demande
 *   GET  /rides/nearby                  — Chauffeurs disponibles proches (carte)
 *   POST /rides                         — Créer une demande de course
 *   GET  /rides/active                  — Course active du client connecté
 *   GET  /rides/:id                     — Détail d'une course
 *   GET  /rides/:id/stream              — SSE : suivi temps réel (position, statut)
 *   POST /rides/:id/cancel              — Client annule la course
 *
 * Flux chauffeur :
 *   POST /rides/driver/online           — Passer en ligne (ouvre le SSE)
 *   POST /rides/driver/offline          — Passer hors ligne
 *   POST /rides/driver/location         — Mettre à jour la position GPS
 *   GET  /rides/driver/stream           — SSE : recevoir les nouvelles demandes
 *   GET  /rides/driver/active           — Course active du chauffeur
 *   POST /rides/:id/accept              — Chauffeur accepte la course
 *   POST /rides/:id/arrived             — Chauffeur arrivé au point de départ
 *   POST /rides/:id/start               — Course commencée (client à bord)
 *   POST /rides/:id/complete            — Course terminée
 *   POST /rides/:id/driver-cancel       — Chauffeur annule
 *
 * Statuts de course :
 *   searching    → En recherche de chauffeur (timeout 60s)
 *   accepted     → Chauffeur accepté, en route vers le client
 *   arrived      → Chauffeur arrivé au point de départ
 *   in_progress  → Course en cours (client à bord)
 *   completed    → Course terminée
 *   cancelled    → Annulée (client, chauffeur, ou timeout)
 *
 * PAIEMENT :
 *   Mobile money uniquement (orange_money | moov | telecel_money).
 *   Cash refusé — prévient les courses sans paiement.
 *   Le paiement est initié via CinetPay Checkout à la fin de la course.
 *   La route /payments/ride-complete est appelée après "complete".
 *
 * SSE :
 *   Server-Sent Events pour la communication temps réel.
 *   Le client s'abonne à GET /rides/:id/stream.
 *   Le chauffeur s'abonne à GET /rides/driver/stream.
 *   La position du chauffeur est diffusée au client toutes les 5s via POST /rides/driver/location.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import {
  subscribeCustomer, unsubscribeCustomer,
  subscribeDriver, unsubscribeDriver,
  pushToCustomer, pushToDriver, pushToDriversInCity,
  writeKeepAlive, haversineKm,
} from "../../services/ride-sse.service.js";
import { estimatePrice, DEFAULT_RATES } from "../../utils/pricing.js";
import { notifyRideStatus } from "../../services/notification.service.js";

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/** Délai avant expiration d'une demande sans chauffeur (ms) */
const SEARCH_TIMEOUT_MS = 60_000;

/** Méthodes de paiement autorisées — cash exclu intentionnellement */
const ALLOWED_PAYMENT_METHODS = ["orange_money", "moov", "telecel_money"] as const;

/* ============================================================
 * SCHÉMAS DE VALIDATION
 * ============================================================ */

const CreateRideSchema = z.object({
  city_id:         z.string().uuid(),
  pickup_lat:      z.number().min(-90).max(90),
  pickup_lng:      z.number().min(-180).max(180),
  pickup_address:  z.string().max(500).optional(),
  dropoff_lat:     z.number().min(-90).max(90),
  dropoff_lng:     z.number().min(-180).max(180),
  dropoff_address: z.string().max(500).optional(),
  ride_type:       z.enum(["taxi", "zemidjan"]),
  /* Mobile money requis — pas de cash */
  payment_method:  z.enum(ALLOWED_PAYMENT_METHODS),
  payment_phone:   z.string().min(8).max(20), /* Numéro mobile money du client */
});

const LocationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/* ============================================================
 * HELPERS
 * ============================================================ */

/** Sélectionne les champs publics d'une course pour le client */
const RIDE_SELECT = {
  id: true, status: true,
  pickup_lat: true, pickup_lng: true, pickup_address: true,
  dropoff_lat: true, dropoff_lng: true, dropoff_address: true,
  ride_type: true,
  estimated_price: true, final_price: true,
  payment_method: true,
  requested_at: true, accepted_at: true, completed_at: true, cancelled_at: true,
  driver: {
    select: {
      id: true,
      vehicle_type: true, vehicle_plate: true,
      driver_type: true,
      rating_avg: true,
      current_lat: true, current_lng: true, last_location_at: true,
      user: { select: { first_name: true, last_name: true, phone: true } },
    },
  },
} as const;

function serializeRide(ride: {
  id: string; status: string;
  pickup_lat: number; pickup_lng: number; pickup_address: string | null;
  dropoff_lat: number; dropoff_lng: number; dropoff_address: string | null;
  ride_type: string; estimated_price: number; final_price: number | null;
  payment_method: string;
  requested_at: Date; accepted_at: Date | null; completed_at: Date | null; cancelled_at: Date | null;
  driver: {
    id: string; vehicle_type: string | null; vehicle_plate: string | null;
    driver_type: string; rating_avg: number;
    current_lat: number | null; current_lng: number | null; last_location_at: Date | null;
    user: { first_name: string | null; last_name: string | null; phone: string };
  } | null;
}) {
  return {
    ...ride,
    requested_at:   ride.requested_at.toISOString(),
    accepted_at:    ride.accepted_at?.toISOString()  ?? null,
    completed_at:   ride.completed_at?.toISOString() ?? null,
    cancelled_at:   ride.cancelled_at?.toISOString() ?? null,
    driver: ride.driver ? {
      ...ride.driver,
      last_location_at: ride.driver.last_location_at?.toISOString() ?? null,
    } : null,
  };
}

/* ============================================================
 * PLUGIN
 * ============================================================ */

export const ridesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /rides/estimate — Estimation du prix avant demande
   * Publique — le client voit le prix avant de s'engager.
   * ============================================================ */
  app.get("/estimate", async (request, reply) => {
    const q = request.query as Record<string, string>;
    const parse = z.object({
      pickup_lat:  z.coerce.number(),
      pickup_lng:  z.coerce.number(),
      dropoff_lat: z.coerce.number(),
      dropoff_lng: z.coerce.number(),
      ride_type:   z.enum(["taxi", "zemidjan"]).default("zemidjan"),
      city_id:     z.string().uuid().optional(),
    }).safeParse(q);

    if (!parse.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, ride_type, city_id } = parse.data;

    /* Tarifs + règles de la ville si connue, sinon tarifs nationaux par défaut */
    const now = new Date();
    const [cityRates, cityRules] = city_id
      ? await Promise.all([
          prisma.city.findUnique({
            where:  { id: city_id },
            select: { taxi_rate_per_km: true, zemidjan_rate_per_km: true, min_fare: true, night_rate_multiplier: true },
          }),
          prisma.cityPricingRule.findMany({
            where:  { city_id, is_active: true },
            select: { taxi_multiplier: true, zemidjan_multiplier: true, months: true, weekdays: true, hour_start: true, hour_end: true, date_from: true, date_to: true },
          }),
        ])
      : [null, []];
    const rates = cityRates ?? DEFAULT_RATES;

    const distKm = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
    const price  = estimatePrice(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, ride_type, rates, cityRules, now);

    return reply.status(200).send({
      estimated_price: price,
      distance_km:     Math.round(distKm * 10) / 10,
      ride_type,
      rates: {
        per_km:          ride_type === "taxi" ? rates.taxi_rate_per_km : rates.zemidjan_rate_per_km,
        min_fare:        rates.min_fare,
        night_surcharge: rates.night_rate_multiplier > 1,
      },
    });
  });

  /* ============================================================
   * GET /rides/nearby — Chauffeurs disponibles proches
   *
   * Retourne les chauffeurs disponibles dans un rayon de 5km.
   * Utilisé par le client pour voir la densité avant de demander.
   * ============================================================ */
  app.get("/nearby", async (request, reply) => {
    const q = request.query as Record<string, string>;
    const parse = z.object({
      lat:       z.coerce.number(),
      lng:       z.coerce.number(),
      ride_type: z.enum(["taxi", "zemidjan", "both"]).optional(),
    }).safeParse(q);

    if (!parse.success) {
      return reply.status(422).send({ error: "lat et lng requis", code: "VALIDATION_ERROR" });
    }

    const { lat, lng, ride_type } = parse.data;

    const where: Record<string, unknown> = {
      is_available: true,
      is_approved:  true,
      current_lat:  { not: null },
      current_lng:  { not: null },
    };
    if (ride_type && ride_type !== "both") {
      where["driver_type"] = { in: [ride_type, "both"] };
    }

    const drivers = await prisma.driver.findMany({
      where,
      select: {
        id:          true,
        driver_type: true,
        vehicle_type: true,
        current_lat: true,
        current_lng: true,
        rating_avg:  true,
      },
      take: 50,
    });

    /* Filtrer ceux dans un rayon de 5km */
    const nearby = drivers
      .filter((d) => {
        if (d.current_lat === null || d.current_lng === null) return false;
        return haversineKm(lat, lng, d.current_lat, d.current_lng) <= 5;
      })
      .map((d) => ({
        id:          d.id,
        driver_type: d.driver_type,
        vehicle_type: d.vehicle_type,
        lat:         d.current_lat!,
        lng:         d.current_lng!,
        rating_avg:  d.rating_avg,
        distance_km: Math.round(
          haversineKm(lat, lng, d.current_lat!, d.current_lng!) * 10
        ) / 10,
      }));

    return reply.status(200).send({ drivers: nearby, count: nearby.length });
  });

  /* ============================================================
   * POST /rides — Créer une demande de course
   *
   * 1. Valide les données
   * 2. Récupère la ville du client (depuis son profil ou coordonnées)
   * 3. Calcule le prix estimé
   * 4. Crée le RideRequest (status: "searching")
   * 5. Diffuse aux chauffeurs disponibles via SSE
   * 6. Démarre un timeout de 60s → annulation si pas d'acceptation
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;

    /* Vérifier qu'il n'y a pas déjà une course active */
    const existingRide = await prisma.rideRequest.findFirst({
      where: { user_id: userId, status: { in: ["searching", "accepted", "arrived", "in_progress"] } },
      select: { id: true },
    });
    if (existingRide) {
      return reply.status(409).send({
        error: "Vous avez déjà une course en cours",
        code: "RIDE_ALREADY_ACTIVE",
        ride_id: existingRide.id,
      });
    }

    const parse = CreateRideSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR", details: parse.error.flatten() });
    }

    const {
      city_id: cityId,
      pickup_lat, pickup_lng, pickup_address,
      dropoff_lat, dropoff_lng, dropoff_address,
      ride_type, payment_method, payment_phone,
    } = parse.data;

    /* Vérifier que la ville existe et récupérer ses tarifs + règles actives */
    const requestedAt = new Date();
    const [city, cityRules] = await Promise.all([
      prisma.city.findUnique({
        where:  { id: cityId },
        select: { id: true, taxi_rate_per_km: true, zemidjan_rate_per_km: true, min_fare: true, night_rate_multiplier: true },
      }),
      prisma.cityPricingRule.findMany({
        where:  { city_id: cityId, is_active: true },
        select: { taxi_multiplier: true, zemidjan_multiplier: true, months: true, weekdays: true, hour_start: true, hour_end: true, date_from: true, date_to: true },
      }),
    ]);
    if (!city) {
      return reply.status(400).send({ error: "Ville introuvable", code: "INVALID_CITY" });
    }

    const estimatedPrice = estimatePrice(
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      ride_type, city, cityRules, requestedAt,
    );

    /* Créer la demande */
    const ride = await prisma.rideRequest.create({
      data: {
        user_id:  userId,
        city_id:  cityId,
        pickup_lat, pickup_lng,
        dropoff_lat, dropoff_lng,
        ride_type,
        estimated_price:  estimatedPrice,
        payment_method,
        status: "searching",
        ...(pickup_address  ? { pickup_address }  : {}),
        ...(dropoff_address ? { dropoff_address } : {}),
        /* Stocker le numéro de paiement dans payment_id temporairement */
        ...(payment_phone ? { payment_id: payment_phone } : {}),
      },
      select: { id: true, estimated_price: true, status: true, city_id: true },
    });

    /* Diffuser aux chauffeurs disponibles de la ville via SSE */
    pushToDriversInCity(cityId, "new_request", {
      ride_id:         ride.id,
      pickup_lat,      pickup_lng,
      pickup_address:  pickup_address ?? null,
      dropoff_lat,     dropoff_lng,
      dropoff_address: dropoff_address ?? null,
      ride_type,
      estimated_price: estimatedPrice,
    });

    /* Timeout 60s — annulation automatique si pas de chauffeur */
    setTimeout(() => {
      void (async () => {
        const current = await prisma.rideRequest.findUnique({
          where: { id: ride.id },
          select: { status: true },
        });
        if (current?.status !== "searching") return; /* Déjà acceptée */

        await prisma.rideRequest.update({
          where: { id: ride.id },
          data: {
            status:      "cancelled",
            cancelled_at: new Date(),
          },
        });

        /* Notifier le client que la course a expiré */
        pushToCustomer(ride.id, "cancelled", {
          reason: "Aucun chauffeur disponible dans votre secteur — réessayez.",
        });
      })();
    }, SEARCH_TIMEOUT_MS);

    return reply.status(201).send({
      ride_id:         ride.id,
      estimated_price: ride.estimated_price,
      status:          ride.status,
      message:         "Course créée — en recherche de chauffeur",
    });
  });

  /* ============================================================
   * GET /rides/active — Course active du client
   * ============================================================ */
  app.get("/active", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const ride = await prisma.rideRequest.findFirst({
      where: {
        user_id: request.user.sub,
        status:  { in: ["searching", "accepted", "arrived", "in_progress"] },
      },
      select: RIDE_SELECT,
    });

    if (!ride) {
      return reply.status(404).send({ error: "Aucune course active", code: "NO_ACTIVE_RIDE" });
    }

    return reply.status(200).send({ ride: serializeRide(ride) });
  });

  /* ============================================================
   * GET /rides/me — Historique des courses de l'utilisateur
   * ============================================================ */
  app.get("/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { status, limit = "20", offset = "0" } = request.query as Record<string, string>;

    const rides = await prisma.rideRequest.findMany({
      where: {
        user_id: request.user.sub,
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        ride_type: true,
        pickup_address: true,
        dropoff_address: true,
        estimated_price: true,
        final_price: true,
        status: true,
        requested_at: true,
        completed_at: true,
        cancelled_at: true,
        city: { select: { name: true } },
      },
      orderBy: { requested_at: "desc" },
      take: Math.min(parseInt(limit, 10) || 20, 50),
      skip: parseInt(offset, 10) || 0,
    });

    return reply.status(200).send({ rides });
  });

  /* ============================================================
   * GET /rides/driver/active — Course active du chauffeur
   * ============================================================ */
  app.get("/driver/active", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    const ride = await prisma.rideRequest.findFirst({
      where: {
        driver_id: driver.id,
        status:    { in: ["accepted", "arrived", "in_progress"] },
      },
      select: RIDE_SELECT,
    });

    if (!ride) {
      return reply.status(404).send({ error: "Aucune course active", code: "NO_ACTIVE_RIDE" });
    }

    return reply.status(200).send({ ride: serializeRide(ride) });
  });

  /* ============================================================
   * GET /rides/:id — Détail d'une course
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const driver = await prisma.driver.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });

    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      select: RIDE_SELECT,
    });

    if (!ride) {
      return reply.status(404).send({ error: "Course introuvable", code: "NOT_FOUND" });
    }

    /* Seul le client ou le chauffeur assigné peut voir la course */
    const isCustomer = ride.id === id && (await prisma.rideRequest.count({ where: { id, user_id: userId } })) > 0;
    const isDriver   = driver?.id === ride.driver?.id;
    if (!isCustomer && !isDriver) {
      return reply.status(403).send({ error: "Accès non autorisé", code: "FORBIDDEN" });
    }

    return reply.status(200).send({ ride: serializeRide(ride) });
  });

  /* ============================================================
   * GET /rides/:id/stream — SSE pour le client (suivi temps réel)
   *
   * Le client s'abonne à ce flux après avoir créé une demande.
   * Reçoit :
   *   "driver_accepted"  : { driver info }
   *   "driver_location"  : { lat, lng, timestamp }
   *   "status_changed"   : { status, ... }
   *   "cancelled"        : { reason }
   * ============================================================ */
  app.get("/:id/stream", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    /* Vérifier que la course appartient à ce client */
    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      select: { user_id: true, status: true },
    });
    if (!ride || ride.user_id !== userId) {
      return reply.status(404).send({ error: "Course introuvable", code: "NOT_FOUND" });
    }
    if (ride.status === "completed" || ride.status === "cancelled") {
      return reply.status(410).send({ error: "Cette course est terminée", code: "RIDE_ENDED" });
    }

    /* En-têtes SSE */
    reply.raw.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", /* Nginx : désactiver le buffering */
    });

    const { raw: res } = reply;
    subscribeCustomer(id, res);

    /* Ping keepalive toutes les 20s */
    const pingInterval = setInterval(() => writeKeepAlive(res), 20_000);

    /* Nettoyage à la déconnexion */
    res.on("close", () => {
      clearInterval(pingInterval);
      unsubscribeCustomer(id, res);
    });

    /* Message initial — confirme que le SSE est connecté */
    res.write(`event: connected\ndata: {"ride_id":"${id}"}\n\n`);
  });

  /* ============================================================
   * POST /rides/:id/cancel — Client annule la course
   * ============================================================ */
  app.post("/:id/cancel", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id }  = request.params as { id: string };
    const userId  = request.user.sub;

    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      select: { user_id: true, status: true, driver_id: true },
    });

    if (!ride || ride.user_id !== userId) {
      return reply.status(404).send({ error: "Course introuvable", code: "NOT_FOUND" });
    }

    const cancellableStatuses = ["searching", "accepted", "arrived"];
    if (!cancellableStatuses.includes(ride.status)) {
      return reply.status(409).send({
        error: `Impossible d'annuler une course au statut "${ride.status}"`,
        code: "INVALID_STATUS",
      });
    }

    await prisma.rideRequest.update({
      where: { id },
      data: { status: "cancelled", cancelled_at: new Date() },
    });

    /* Notifier le chauffeur assigné si applicable */
    if (ride.driver_id) {
      pushToDriver(ride.driver_id, "ride_cancelled", {
        ride_id: id, reason: "Client a annulé la course",
      });
    }

    /* Notifier le SSE client pour fermer proprement */
    pushToCustomer(id, "cancelled", { reason: "Vous avez annulé la course" });

    return reply.status(200).send({ message: "Course annulée" });
  });

  /* ============================================================
   * POST /rides/driver/online — Chauffeur passe en ligne
   * ============================================================ */
  app.post("/driver/online", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true, is_approved: true, city_id: true },
    });

    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }
    if (!driver.is_approved) {
      return reply.status(403).send({ error: "Votre candidature n'est pas encore approuvée", code: "NOT_APPROVED" });
    }

    await prisma.driver.update({
      where: { id: driver.id },
      data:  { is_available: true },
    });

    return reply.status(200).send({ message: "Vous êtes maintenant en ligne", driver_id: driver.id, city_id: driver.city_id });
  });

  /* ============================================================
   * POST /rides/driver/offline — Chauffeur passe hors ligne
   * ============================================================ */
  app.post("/driver/offline", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    await prisma.driver.update({
      where: { id: driver.id },
      data:  { is_available: false },
    });

    unsubscribeDriver(driver.id);

    return reply.status(200).send({ message: "Vous êtes maintenant hors ligne" });
  });

  /* ============================================================
   * POST /rides/driver/location — Mise à jour position GPS
   *
   * Appelé par l'app chauffeur toutes les 5 secondes.
   * Met à jour la DB + diffuse au client qui suit la course.
   * ============================================================ */
  app.post("/driver/location", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parse = LocationUpdateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR" });
    }

    const { lat, lng } = parse.data;
    const userId = request.user.sub;

    const driver = await prisma.driver.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    /* Mettre à jour la position en DB */
    await prisma.driver.update({
      where: { id: driver.id },
      data:  { current_lat: lat, current_lng: lng, last_location_at: new Date() },
    });

    /* Si le chauffeur est en course, diffuser la position au client */
    const activeRide = await prisma.rideRequest.findFirst({
      where: {
        driver_id: driver.id,
        status:    { in: ["accepted", "arrived", "in_progress"] },
      },
      select: { id: true },
    });

    if (activeRide) {
      pushToCustomer(activeRide.id, "driver_location", {
        lat, lng, timestamp: new Date().toISOString(),
      });
    }

    return reply.status(200).send({ ok: true });
  });

  /* ============================================================
   * GET /rides/driver/stream — SSE pour le chauffeur
   *
   * Le chauffeur ouvre ce flux quand il passe en ligne.
   * Reçoit :
   *   "new_request"    : { ride_id, pickup, dropoff, ride_type, estimated_price }
   *   "request_expired": { ride_id } — le client a annulé ou timeout
   *   "ride_cancelled" : { ride_id, reason }
   * ============================================================ */
  app.get("/driver/stream", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true, city_id: true, is_approved: true },
    });

    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }
    if (!driver.is_approved) {
      return reply.status(403).send({ error: "Profil non approuvé", code: "NOT_APPROVED" });
    }

    /* En-têtes SSE */
    reply.raw.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const { raw: res } = reply;
    subscribeDriver(driver.id, driver.city_id, res);

    const pingInterval = setInterval(() => writeKeepAlive(res), 20_000);

    res.on("close", () => {
      clearInterval(pingInterval);
      unsubscribeDriver(driver.id);
      /* Passer le chauffeur hors ligne quand il ferme le SSE */
      void prisma.driver.update({
        where: { id: driver.id },
        data:  { is_available: false },
      }).catch(() => { /* ignore */ });
    });

    res.write(`event: connected\ndata: {"driver_id":"${driver.id}"}\n\n`);
  });

  /* ============================================================
   * POST /rides/:id/accept — Chauffeur accepte la course
   * ============================================================ */
  app.post("/:id/accept", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true, vehicle_type: true, vehicle_plate: true, driver_type: true, rating_avg: true,
                user: { select: { first_name: true, last_name: true, phone: true } } },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    /* Vérifier que la course est toujours en recherche */
    const ride = await prisma.rideRequest.findUnique({
      where: { id },
      select: { status: true, driver_id: true, user_id: true },
    });

    if (!ride) {
      return reply.status(404).send({ error: "Course introuvable", code: "NOT_FOUND" });
    }
    if (ride.status !== "searching") {
      return reply.status(409).send({
        error: ride.status === "accepted"
          ? "Cette course a déjà été acceptée par un autre chauffeur"
          : "Cette course n'est plus disponible",
        code: "RIDE_UNAVAILABLE",
      });
    }

    /* Assigner le chauffeur atomiquement */
    const updated = await prisma.rideRequest.updateMany({
      where: { id, status: "searching" }, /* Double check status pour éviter race condition */
      data:  { driver_id: driver.id, status: "accepted", accepted_at: new Date() },
    });

    if (updated.count === 0) {
      return reply.status(409).send({ error: "Course déjà prise", code: "RIDE_UNAVAILABLE" });
    }

    /* Notifier le client via SSE + FCM (fallback si app en arrière-plan) */
    pushToCustomer(id, "driver_accepted", {
      driver: {
        id:           driver.id,
        name:         [driver.user.first_name, driver.user.last_name].filter(Boolean).join(" "),
        phone:        driver.user.phone,
        vehicle_type: driver.vehicle_type,
        vehicle_plate: driver.vehicle_plate,
        driver_type:  driver.driver_type,
        rating_avg:   driver.rating_avg,
      },
    });
    void notifyRideStatus({ userId: ride.user_id, rideId: id, status: "accepted" });

    return reply.status(200).send({ message: "Course acceptée", ride_id: id });
  });

  /* ============================================================
   * POST /rides/:id/arrived — Chauffeur arrivé au point de départ
   * ============================================================ */
  app.post("/:id/arrived", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    const updated = await prisma.rideRequest.updateMany({
      where: { id, driver_id: driver.id, status: "accepted" },
      data:  { status: "arrived" },
    });

    if (updated.count === 0) {
      return reply.status(409).send({ error: "Impossible de mettre à jour le statut", code: "INVALID_STATUS" });
    }

    pushToCustomer(id, "status_changed", { status: "arrived", message: "Votre chauffeur est arrivé !" });
    void prisma.rideRequest.findUnique({ where: { id }, select: { user_id: true } }).then((r) => {
      if (r) void notifyRideStatus({ userId: r.user_id, rideId: id, status: "arrived" });
    });
    return reply.status(200).send({ message: "Statut mis à jour : chauffeur arrivé" });
  });

  /* ============================================================
   * POST /rides/:id/start — Course commencée (client à bord)
   * ============================================================ */
  app.post("/:id/start", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    const updated = await prisma.rideRequest.updateMany({
      where: { id, driver_id: driver.id, status: "arrived" },
      data:  { status: "in_progress" },
    });

    if (updated.count === 0) {
      return reply.status(409).send({ error: "Impossible de démarrer la course", code: "INVALID_STATUS" });
    }

    pushToCustomer(id, "status_changed", { status: "in_progress", message: "Course en cours" });
    return reply.status(200).send({ message: "Course démarrée" });
  });

  /* ============================================================
   * POST /rides/:id/complete — Course terminée
   *
   * Le chauffeur marque la course comme terminée.
   * Déclenche la demande de paiement au client via le canal SSE.
   * ============================================================ */
  app.post("/:id/complete", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    const ride = await prisma.rideRequest.findFirst({
      where: { id, driver_id: driver.id, status: "in_progress" },
      select: { id: true, estimated_price: true, payment_method: true, user_id: true },
    });

    if (!ride) {
      return reply.status(409).send({ error: "Course introuvable ou statut incorrect", code: "INVALID_STATUS" });
    }

    await prisma.rideRequest.update({
      where: { id },
      data:  {
        status:       "completed",
        final_price:  ride.estimated_price, /* Prix estimé = final (peut être ajusté manuellement) */
        completed_at: new Date(),
      },
    });

    /* Notifier le client : course terminée, payer maintenant */
    pushToCustomer(id, "completed", {
      final_price:    ride.estimated_price,
      payment_method: ride.payment_method,
      message:        "Course terminée — merci de procéder au paiement",
    });
    void notifyRideStatus({ userId: ride.user_id, rideId: id, status: "completed" });

    return reply.status(200).send({ message: "Course terminée", final_price: ride.estimated_price });
  });

  /* ============================================================
   * POST /rides/:id/driver-cancel — Chauffeur annule
   * ============================================================ */
  app.post("/:id/driver-cancel", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { user_id: request.user.sub },
      select: { id: true },
    });
    if (!driver) {
      return reply.status(404).send({ error: "Profil chauffeur introuvable", code: "NOT_DRIVER" });
    }

    const updated = await prisma.rideRequest.updateMany({
      where: { id, driver_id: driver.id, status: { in: ["accepted", "arrived"] } },
      data:  { status: "cancelled", cancelled_at: new Date(), driver_id: null },
    });

    if (updated.count === 0) {
      return reply.status(409).send({ error: "Impossible d'annuler", code: "INVALID_STATUS" });
    }

    /* Notifier le client via SSE + FCM */
    pushToCustomer(id, "cancelled", { reason: "Le chauffeur a annulé — nous cherchons un autre chauffeur." });
    void prisma.rideRequest.findUnique({ where: { id }, select: { user_id: true } }).then((r) => {
      if (r) void notifyRideStatus({ userId: r.user_id, rideId: id, status: "cancelled" });
    });

    return reply.status(200).send({ message: "Course annulée" });
  });
};
