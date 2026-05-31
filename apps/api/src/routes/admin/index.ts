/**
 * routes/admin/index.ts — Dashboard administrateur VIVRE
 *
 * Tous les endpoints de ce fichier exigent le rôle "admin".
 * La vérification est faite en amont (authenticate + role check).
 *
 * Endpoints :
 *   GET  /admin/stats                  — Métriques globales de la plateforme
 *   GET  /admin/restaurants            — Liste restaurants avec filtre approbation
 *   GET  /admin/properties             — Liste hébergements avec filtre approbation
 *   GET  /admin/payouts                — Versements livreurs en attente
 *
 * Les endpoints d'approbation individuels sont dans leurs modules respectifs :
 *   PATCH /drivers/:id/approve         — dans routes/drivers/index.ts
 *   PATCH /drivers/:id/reject          — dans routes/drivers/index.ts
 *   PATCH /drivers/payouts/:id/process — dans routes/drivers/index.ts
 *   PATCH /restaurants/:id/approve     — dans routes/food/index.ts
 *   PATCH /properties/:id/approve      — dans routes/properties/index.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { dispatchPayout, refreshPayoutStatus, payoutRegistry } from "../../services/payout.service.js";

/* ============================================================
 * HELPER — vérification rôle admin
 * ============================================================ */

async function requireAdmin(request: Parameters<typeof authenticate>[0], reply: Parameters<typeof authenticate>[1]) {
  await authenticate(request, reply);
  if (reply.sent) return false;
  if (!request.user.roles.includes("admin")) {
    reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    return false;
  }
  return true;
}

/* ============================================================
 * PLUGIN
 * ============================================================ */

export const adminRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /admin/stats — Métriques globales
   *
   * Retourne les chiffres clés de la plateforme pour le tableau
   * de bord administrateur : commandes, revenus, inscriptions.
   * Calculé sur le jour courant et en cumul depuis le lancement.
   * ============================================================ */
  app.get("/stats", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalRestaurants,
      pendingRestaurants,
      totalProperties,
      pendingProperties,
      totalDrivers,
      pendingDrivers,
      totalUsers,
      todayOrders,
      totalOrders,
      pendingPayouts,
    ] = await Promise.all([
      prisma.restaurant.count({ where: { deleted_at: null } }),
      prisma.restaurant.count({ where: { is_approved: false, deleted_at: null } }),
      prisma.property.count({ where: { deleted_at: null } }),
      prisma.property.count({ where: { is_approved: false, deleted_at: null } }),
      prisma.driver.count(),
      prisma.driver.count({ where: { application_status: "pending" } }),
      prisma.user.count(),
      prisma.order.count({
        where: {
          created_at: { gte: today },
          status: { notIn: ["pending_payment", "cancelled"] },
        },
      }),
      prisma.order.count({ where: { status: { notIn: ["pending_payment", "cancelled"] } } }),
      prisma.driverPayout.count({ where: { status: "pending" } }),
    ]);

    /* Revenus du jour (commandes livrées aujourd'hui) */
    const todayRevenue = await prisma.order.aggregate({
      where: {
        created_at: { gte: today },
        status: "delivered",
      },
      _sum: { total_amount: true },
    });

    return reply.status(200).send({
      restaurants: { total: totalRestaurants, pending: pendingRestaurants },
      properties:  { total: totalProperties,  pending: pendingProperties },
      drivers:     { total: totalDrivers,      pending: pendingDrivers },
      users:       { total: totalUsers },
      orders: {
        today:      todayOrders,
        total:      totalOrders,
        today_revenue: todayRevenue._sum.total_amount ?? 0,
      },
      payouts: { pending: pendingPayouts },
    });
  });

  /* ============================================================
   * GET /admin/restaurants — Liste tous les restaurants
   * Filtre par statut d'approbation : ?status=pending|approved|all
   * ============================================================ */
  app.get("/restaurants", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const query = request.query as Record<string, string>;
    const status = query["status"] ?? "pending"; /* pending | approved | all */
    const page   = parseInt(query["page"] ?? "1", 10);
    const limit  = 20;

    type WhereClause = {
      deleted_at: null;
      is_approved?: boolean;
    };

    const where: WhereClause = { deleted_at: null };
    if (status === "pending") where.is_approved = false;
    if (status === "approved") where.is_approved = true;

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        select: {
          id: true, name: true, restaurant_type: true, address: true,
          phone: true, is_approved: true, is_active: true, created_at: true,
          city:  { select: { name: true } },
          owner: { select: { first_name: true, last_name: true, phone: true } },
          _count: { select: { menu_items: true } },
        },
        orderBy: { created_at: status === "pending" ? "asc" : "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.restaurant.count({ where }),
    ]);

    return reply.status(200).send({
      restaurants: restaurants.map((r) => ({
        ...r,
        created_at: r.created_at.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /admin/properties — Liste tous les hébergements
   * Filtre par statut d'approbation : ?status=pending|approved|all
   * ============================================================ */
  app.get("/properties", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const query = request.query as Record<string, string>;
    const status = query["status"] ?? "pending";
    const page   = parseInt(query["page"] ?? "1", 10);
    const limit  = 20;

    type PropWhere = { deleted_at: null; is_approved?: boolean };
    const where: PropWhere = { deleted_at: null };
    if (status === "pending") where.is_approved = false;
    if (status === "approved") where.is_approved = true;

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        select: {
          id: true, name: true, property_type: true, address: true,
          phone: true, star_rating: true, is_approved: true, is_active: true, created_at: true,
          city:  { select: { name: true } },
          owner: { select: { first_name: true, last_name: true, phone: true } },
          _count: { select: { room_types: true } },
        },
        orderBy: { created_at: status === "pending" ? "asc" : "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.property.count({ where }),
    ]);

    return reply.status(200).send({
      properties: properties.map((p) => ({
        ...p,
        created_at: p.created_at.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /admin/payouts — Monitoring des versements automatiques
   * ?status=processing|paid|failed|all (défaut: processing)
   *
   * Les versements sont initiés automatiquement par le PayoutProviderRegistry.
   * L'admin surveille et peut relancer les échecs depuis cette page.
   * ============================================================ */
  app.get("/payouts", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const query  = request.query as Record<string, string>;
    const status = query["status"] ?? "processing";
    const page   = parseInt(query["page"] ?? "1", 10);
    const limit  = 20;

    const where = status === "all" ? {} : { status };

    const [payouts, total] = await Promise.all([
      prisma.driverPayout.findMany({
        where,
        select: {
          id: true, amount_fcfa: true, status: true,
          phone_number: true, payment_method: true,
          provider_transaction_id: true, failure_reason: true,
          admin_note: true, processed_at: true, created_at: true,
          driver: {
            select: {
              id: true, vehicle_type: true, vehicle_plate: true,
              user: { select: { first_name: true, last_name: true, phone: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.driverPayout.count({ where }),
    ]);

    return reply.status(200).send({
      payouts: payouts.map((p) => ({
        ...p,
        created_at:   p.created_at.toISOString(),
        processed_at: p.processed_at?.toISOString() ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
      supported_methods: payoutRegistry.supportedMethods(),
    });
  });

  /* ============================================================
   * POST /admin/payouts/:id/retry — Relancer un versement échoué
   * Corrige optionnellement le numéro avant de relancer.
   * ============================================================ */
  app.post("/payouts/:id/retry", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };
    const body = request.body as { admin_note?: string; phone_number?: string } | null;

    const payout = await prisma.driverPayout.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!payout) {
      return reply.status(404).send({ error: "Versement introuvable", code: "NOT_FOUND" });
    }
    if (payout.status === "paid") {
      return reply.status(409).send({ error: "Ce versement est déjà payé", code: "ALREADY_PAID" });
    }

    const updateData: Record<string, unknown> = { status: "processing", failure_reason: null };
    if (body?.admin_note)   updateData["admin_note"]   = body.admin_note;
    if (body?.phone_number) updateData["phone_number"] = body.phone_number;

    await prisma.driverPayout.update({ where: { id }, data: updateData });
    void dispatchPayout(id);

    return reply.status(200).send({ message: "Versement relancé", payout_id: id });
  });

  /* ============================================================
   * GET /admin/cities/rates — Tarifs intraurbains de toutes les villes
   *
   * Affiche les taux actuels (taxi, zémidjan, min_fare, nuit) pour chaque ville
   * active. L'admin peut ensuite les ajuster via PATCH /admin/cities/:id/rates.
   * ============================================================ */
  app.get("/cities/rates", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const cities = await prisma.city.findMany({
      where:   { is_active: true },
      select:  {
        id: true, name: true, region: true,
        taxi_rate_per_km: true, zemidjan_rate_per_km: true,
        min_fare: true, night_rate_multiplier: true,
        has_drivers: true,
        updated_at: true,
      },
      orderBy: { name: "asc" },
    });

    return reply.status(200).send({
      cities: cities.map((c) => ({ ...c, updated_at: c.updated_at.toISOString() })),
    });
  });

  /* ============================================================
   * PATCH /admin/cities/:id/rates — Modifier les tarifs d'une ville
   *
   * Tous les champs sont optionnels — on ne modifie que ce qui est envoyé.
   * Prend effet immédiatement sur les nouvelles courses (pas de cache).
   *
   * Exemple :
   *   PATCH /admin/cities/uuid/rates
   *   { "taxi_rate_per_km": 280, "night_rate_multiplier": 1.2 }
   * ============================================================ */
  app.patch("/cities/:id/rates", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };

    const parse = z.object({
      taxi_rate_per_km:      z.number().int().min(50).max(2000).optional(),
      zemidjan_rate_per_km:  z.number().int().min(50).max(2000).optional(),
      min_fare:              z.number().int().min(100).max(10000).optional(),
      /* Multiplicateur nuit : 1.0 = pas de surcharge, 1.5 = max +50% */
      night_rate_multiplier: z.number().min(1.0).max(1.5).optional(),
    }).safeParse(request.body);

    if (!parse.success) {
      return reply.status(422).send({
        error:   "Données invalides",
        code:    "VALIDATION_ERROR",
        details: parse.error.flatten(),
      });
    }

    const { taxi_rate_per_km, zemidjan_rate_per_km, min_fare, night_rate_multiplier } = parse.data;

    /* Construire l'objet de mise à jour en excluant les champs absents
     * (exactOptionalPropertyTypes interdit de passer undefined à Prisma) */
    const updateData = {
      ...(taxi_rate_per_km     !== undefined ? { taxi_rate_per_km }     : {}),
      ...(zemidjan_rate_per_km !== undefined ? { zemidjan_rate_per_km } : {}),
      ...(min_fare             !== undefined ? { min_fare }             : {}),
      ...(night_rate_multiplier !== undefined ? { night_rate_multiplier } : {}),
    };

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ error: "Aucun champ à modifier", code: "EMPTY_UPDATE" });
    }

    const city = await prisma.city.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!city) {
      return reply.status(404).send({ error: "Ville introuvable", code: "NOT_FOUND" });
    }

    const updated = await prisma.city.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true,
        taxi_rate_per_km: true, zemidjan_rate_per_km: true,
        min_fare: true, night_rate_multiplier: true,
        updated_at: true,
      },
    });

    return reply.status(200).send({
      ...updated,
      updated_at: updated.updated_at.toISOString(),
    });
  });

  /* ============================================================
   * GET /admin/cities/:id/rules — Liste les règles tarifaires d'une ville
   * ============================================================ */
  app.get("/cities/:id/rules", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };

    const city = await prisma.city.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!city) return reply.status(404).send({ error: "Ville introuvable", code: "NOT_FOUND" });

    const rules = await prisma.cityPricingRule.findMany({
      where:   { city_id: id },
      orderBy: [{ priority: "desc" }, { created_at: "asc" }],
    });

    return reply.status(200).send({
      city,
      rules: rules.map((r) => ({
        ...r,
        date_from:  r.date_from?.toISOString()  ?? null,
        date_to:    r.date_to?.toISOString()    ?? null,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      })),
    });
  });

  /* ============================================================
   * POST /admin/cities/:id/rules — Créer une règle tarifaire
   * ============================================================ */
  app.post("/cities/:id/rules", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id: city_id } = request.params as { id: string };

    const parse = z.object({
      label:               z.string().min(2).max(100),
      months:              z.array(z.number().int().min(1).max(12)).default([]),
      weekdays:            z.array(z.number().int().min(0).max(6)).default([]),
      hour_start:          z.number().int().min(0).max(23).nullable().default(null),
      hour_end:            z.number().int().min(0).max(23).nullable().default(null),
      date_from:           z.string().datetime().nullable().default(null),
      date_to:             z.string().datetime().nullable().default(null),
      taxi_multiplier:     z.number().min(0.5).max(2.0).default(1.0),
      zemidjan_multiplier: z.number().min(0.5).max(2.0).default(1.0),
      priority:            z.number().int().min(0).max(100).default(0),
      is_active:           z.boolean().default(true),
    }).safeParse(request.body);

    if (!parse.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR", details: parse.error.flatten() });
    }

    const city = await prisma.city.findUnique({ where: { id: city_id }, select: { id: true } });
    if (!city) return reply.status(404).send({ error: "Ville introuvable", code: "NOT_FOUND" });

    const { date_from, date_to, ...rest } = parse.data;

    const rule = await prisma.cityPricingRule.create({
      data: {
        ...rest,
        city_id,
        ...(date_from ? { date_from: new Date(date_from) } : {}),
        ...(date_to   ? { date_to:   new Date(date_to) }   : {}),
      },
    });

    return reply.status(201).send({
      ...rule,
      date_from:  rule.date_from?.toISOString()  ?? null,
      date_to:    rule.date_to?.toISOString()    ?? null,
      created_at: rule.created_at.toISOString(),
      updated_at: rule.updated_at.toISOString(),
    });
  });

  /* ============================================================
   * PATCH /admin/rules/:id — Modifier une règle (partiel)
   * ============================================================ */
  app.patch("/rules/:id", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };

    const parse = z.object({
      label:               z.string().min(2).max(100).optional(),
      months:              z.array(z.number().int().min(1).max(12)).optional(),
      weekdays:            z.array(z.number().int().min(0).max(6)).optional(),
      hour_start:          z.number().int().min(0).max(23).nullable().optional(),
      hour_end:            z.number().int().min(0).max(23).nullable().optional(),
      date_from:           z.string().datetime().nullable().optional(),
      date_to:             z.string().datetime().nullable().optional(),
      taxi_multiplier:     z.number().min(0.5).max(2.0).optional(),
      zemidjan_multiplier: z.number().min(0.5).max(2.0).optional(),
      priority:            z.number().int().min(0).max(100).optional(),
      is_active:           z.boolean().optional(),
    }).safeParse(request.body);

    if (!parse.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR", details: parse.error.flatten() });
    }

    const existing = await prisma.cityPricingRule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "Règle introuvable", code: "NOT_FOUND" });

    const {
      label, months, weekdays, hour_start, hour_end,
      date_from, date_to, taxi_multiplier, zemidjan_multiplier, priority, is_active,
    } = parse.data;

    const updateData = {
      ...(label               !== undefined ? { label }               : {}),
      ...(months              !== undefined ? { months }              : {}),
      ...(weekdays            !== undefined ? { weekdays }            : {}),
      ...(hour_start          !== undefined ? { hour_start }          : {}),
      ...(hour_end            !== undefined ? { hour_end }            : {}),
      ...(taxi_multiplier     !== undefined ? { taxi_multiplier }     : {}),
      ...(zemidjan_multiplier !== undefined ? { zemidjan_multiplier } : {}),
      ...(priority            !== undefined ? { priority }            : {}),
      ...(is_active           !== undefined ? { is_active }           : {}),
      ...(date_from !== undefined ? { date_from: date_from ? new Date(date_from) : null } : {}),
      ...(date_to   !== undefined ? { date_to:   date_to   ? new Date(date_to)   : null } : {}),
    };

    const rule = await prisma.cityPricingRule.update({ where: { id }, data: updateData });

    return reply.status(200).send({
      ...rule,
      date_from:  rule.date_from?.toISOString()  ?? null,
      date_to:    rule.date_to?.toISOString()    ?? null,
      created_at: rule.created_at.toISOString(),
      updated_at: rule.updated_at.toISOString(),
    });
  });

  /* ============================================================
   * DELETE /admin/rules/:id — Supprimer une règle
   * ============================================================ */
  app.delete("/rules/:id", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };

    const existing = await prisma.cityPricingRule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "Règle introuvable", code: "NOT_FOUND" });

    await prisma.cityPricingRule.delete({ where: { id } });
    return reply.status(200).send({ deleted: true });
  });

  /* ============================================================
   * GET /admin/events — Liste tous les événements
   * Filtre par statut : ?status=pending_approval|approved|rejected|all
   * ============================================================ */
  app.get("/events", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const query  = request.query as Record<string, string>;
    const status = query["status"] ?? "pending_approval";
    const page   = parseInt(query["page"] ?? "1", 10);
    const limit  = 20;

    const where = status === "all" ? { deleted_at: null } : { status, deleted_at: null };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true, title: true, status: true, starts_at: true, venue_name: true,
          commission_percent: true, created_at: true,
          city:      { select: { name: true } },
          organizer: { select: { first_name: true, last_name: true, phone: true } },
          _count:    { select: { bookings: true } },
        },
        orderBy: { created_at: status === "pending_approval" ? "asc" : "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.event.count({ where }),
    ]);

    return reply.status(200).send({
      events: events.map((e) => ({
        ...e,
        starts_at:  e.starts_at.toISOString(),
        created_at: e.created_at.toISOString(),
      })),
      total, page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * POST /admin/payouts/:id/refresh — Interroger l'opérateur pour màj statut
   * Utile si le webhook CinetPay Transfer n'est pas reçu.
   * ============================================================ */
  app.post("/payouts/:id/refresh", async (request, reply) => {
    const ok = await requireAdmin(request, reply);
    if (!ok) return;

    const { id } = request.params as { id: string };
    await refreshPayoutStatus(id);

    const updated = await prisma.driverPayout.findUnique({
      where: { id },
      select: { id: true, status: true, provider_transaction_id: true, failure_reason: true },
    });

    return reply.status(200).send(updated);
  });
};
