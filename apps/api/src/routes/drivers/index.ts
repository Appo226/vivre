/**
 * routes/drivers/index.ts — Module Livreurs : onboarding + gains + versements
 *
 * Le réseau de livreurs VIVRE est constitué principalement de zémidjans
 * (motos-taxis burkinabè) qui peuvent également faire de la livraison food.
 * Les coursiers à vélo et les taxis peuvent aussi s'inscrire.
 *
 * Flux d'onboarding :
 *   1. L'aspirant livreur remplit le formulaire (vehicle, plaque, permis)
 *   2. Il uploade ses documents (CNI, permis de conduire, carte grise)
 *   3. L'admin vérifie le dossier et approuve ou rejette avec raison
 *   4. Le livreur reçoit une notification et peut commencer à livrer
 *
 * Modèle de rémunération :
 *   - VIVRE prend 20% du delivery_fee de chaque commande
 *   - Le livreur touche 80% du delivery_fee
 *   - Les gains s'accumulent jusqu'à demande de versement (minimum 5 000 FCFA)
 *   - L'admin traite les versements manuellement via Orange Money ou Moov
 *
 * Endpoints publics : aucun (toutes les routes nécessitent l'authentification)
 *
 * driversRoutes (/drivers) :
 *   POST /apply              — Postuler comme livreur
 *   GET  /me                 — Mon profil livreur + stats du jour
 *   PATCH /me/availability   — Activer / désactiver disponibilité
 *   GET  /me/deliveries      — Historique de mes livraisons
 *   GET  /me/earnings        — Récapitulatif des gains + historique versements
 *   POST /me/payout          — Demander un versement
 *   GET  /                   — Admin : liste des candidatures
 *   PATCH /:id/approve       — Admin : approuver un dossier
 *   PATCH /:id/reject        — Admin : rejeter avec raison
 *   PATCH /payouts/:payoutId/process — Admin : marquer un versement comme traité
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { dispatchPayout, refreshPayoutStatus, payoutRegistry } from "../../services/payout.service.js";

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/* Taux de commission VIVRE sur chaque delivery_fee */
const PLATFORM_COMMISSION = 0.20;
/* Part nette reversée au livreur */
const DRIVER_SHARE = 1 - PLATFORM_COMMISSION;
/* Minimum de gains requis pour demander un versement (5 000 FCFA) */
const MIN_PAYOUT_FCFA = 5_000;

/* ============================================================
 * SCHÉMAS ZOD (locaux — trop spécifiques pour un fichier séparé)
 * ============================================================ */

const ApplySchema = z.object({
  city_id:        z.string().uuid(),
  driver_type:    z.enum(["zemidjan", "taxi", "both"]),
  vehicle_type:   z.string().min(2).max(100),       /* Ex: "Moto Honda CG 125" */
  vehicle_plate:  z.string().min(2).max(20),
  license_number: z.string().min(4).max(30),
  /*
   * documents : URLs Firebase Storage des pièces fournies lors de l'upload.
   * L'upload est fait en amont via POST /uploads (Firebase Storage).
   * Ici on reçoit juste les URLs résultantes.
   */
  documents: z.object({
    id_card_url:      z.string().url(),   /* CNI ou passeport */
    license_url:      z.string().url(),   /* Permis de conduire */
    vehicle_reg_url:  z.string().url(),   /* Carte grise */
    selfie_url:       z.string().url().optional(), /* Photo du candidat */
  }),
  /* Coordonnées de versement — renseignées dès l'inscription */
  payout_phone:  z.string().min(8).max(20),
  payout_method: z.enum(["orange_money", "moov", "telecel_money"]),
});

const PayoutRequestSchema = z.object({
  /* Période couverte par la demande de versement */
  period_from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /* Coordonnées de versement (peut différer du défaut enregistré) */
  payment_method: z.enum(["orange_money", "moov", "telecel_money"]),
  phone_number:   z.string().min(8).max(20),
});

const RejectSchema = z.object({
  reason: z.string().min(10).max(1000),
});

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Calcule le total des gains d'un livreur sur une période donnée.
 * Gains = sum(delivery_fee × 80%) pour toutes les commandes delivered.
 *
 * @param driverId   UUID du Driver (pas du User)
 * @param from       Date ISO début de période (optionnel)
 * @param to         Date ISO fin de période (optionnel)
 */
async function calcEarnings(
  driverId: string,
  from?: Date,
  to?: Date
): Promise<{ gross: number; net: number; count: number }> {
  const deliveries = await prisma.order.findMany({
    where: {
      driver_id: driverId,
      status: "delivered",
      ...(from || to
        ? {
            delivered_at: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    },
    select: { delivery_fee: true },
  });

  const gross = deliveries.reduce((sum, o) => sum + o.delivery_fee, 0);
  return {
    gross,
    net: Math.round(gross * DRIVER_SHARE),
    count: deliveries.length,
  };
}

/**
 * Calcule le montant déjà versé à un livreur (statuts paid).
 */
async function calcPaidOut(driverId: string): Promise<number> {
  const result = await prisma.driverPayout.aggregate({
    where: { driver_id: driverId, status: "paid" },
    _sum: { amount_fcfa: true },
  });
  return result._sum.amount_fcfa ?? 0;
}

/* ============================================================
 * ROUTES
 * ============================================================ */

export const driversRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * POST /drivers/apply — Postuler comme livreur
   * Crée un profil Driver avec application_status = "pending".
   * Un même user ne peut avoir qu'un seul profil Driver (unique constraint).
   * ============================================================ */
  app.post("/apply", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = ApplySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const data = parseResult.data;
    const userId = request.user.sub;

    /* Vérifier qu'il n'y a pas déjà un profil pour cet utilisateur */
    const existing = await prisma.driver.findUnique({ where: { user_id: userId } });
    if (existing) {
      return reply.status(409).send({
        error: "Vous avez déjà une candidature en cours ou un profil livreur actif",
        code: "DRIVER_ALREADY_EXISTS",
        details: { status: existing.application_status },
      });
    }

    const driver = await prisma.driver.create({
      data: {
        user_id:           userId,
        city_id:           data.city_id,
        driver_type:       data.driver_type,
        vehicle_type:      data.vehicle_type,
        vehicle_plate:     data.vehicle_plate,
        license_number:    data.license_number,
        documents:         data.documents,
        payout_phone:      data.payout_phone,
        payout_method:     data.payout_method,
        can_deliver_food:  true,   /* Par défaut, tous les livreurs VIVRE livrent aussi la nourriture */
        application_status: "pending",
        is_approved:       false,
        is_available:      false,
      },
      select: {
        id: true, application_status: true, driver_type: true,
        vehicle_type: true, vehicle_plate: true,
      },
    });

    return reply.status(201).send({
      ...driver,
      message:
        "Candidature soumise ! Notre équipe va vérifier votre dossier sous 48h ouvrées. " +
        "Vous recevrez une notification dès que votre profil sera validé.",
    });
  });

  /* ============================================================
   * GET /drivers/me — Mon profil livreur + statistiques du jour
   * Inclut les gains du jour et les livraisons en cours.
   * ============================================================ */
  app.get("/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const driver = await prisma.driver.findUnique({
      where: { user_id: userId },
      select: {
        id: true, driver_type: true, vehicle_type: true, vehicle_plate: true,
        is_available: true, can_deliver_food: true, rating_avg: true,
        application_status: true, rejection_reason: true,
        payout_phone: true, payout_method: true,
        city: { select: { name: true } },
        _count: { select: { food_deliveries: true } },
      },
    });

    if (!driver) {
      return reply.status(404).send({
        error: "Aucun profil livreur trouvé — soumettez d'abord une candidature",
        code: "DRIVER_NOT_FOUND",
      });
    }

    /* Stats du jour */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEarnings = await calcEarnings(driver.id, todayStart, new Date());

    /* Livraisons actives (en cours) */
    const activeDeliveries = await prisma.order.count({
      where: {
        driver_id: driver.id,
        status: { in: ["picked_up", "ready"] },
      },
    });

    return reply.status(200).send({
      ...driver,
      today_earnings_fcfa: todayEarnings.net,
      today_deliveries: todayEarnings.count,
      active_deliveries: activeDeliveries,
      total_deliveries: driver._count.food_deliveries,
    });
  });

  /* ============================================================
   * PATCH /drivers/me/availability — Activer / désactiver disponibilité
   * Seuls les livreurs approuvés peuvent se mettre en disponible.
   * ============================================================ */
  app.patch("/me/availability", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const driver = await prisma.driver.findUnique({
      where: { user_id: userId },
      select: { id: true, application_status: true, is_available: true },
    });

    if (!driver) {
      return reply.status(404).send({ error: "Profil livreur introuvable", code: "DRIVER_NOT_FOUND" });
    }

    if (driver.application_status !== "approved") {
      return reply.status(403).send({
        error: "Votre dossier n'est pas encore validé",
        code: "DRIVER_NOT_APPROVED",
      });
    }

    const body = request.body as { is_available?: boolean };
    /* Si pas spécifié, on toggle */
    const newAvailability = typeof body.is_available === "boolean"
      ? body.is_available
      : !driver.is_available;

    await prisma.driver.update({
      where: { id: driver.id },
      data: { is_available: newAvailability },
    });

    return reply.status(200).send({
      is_available: newAvailability,
      message: newAvailability ? "Vous êtes maintenant disponible pour les livraisons" : "Vous êtes hors ligne",
    });
  });

  /* ============================================================
   * GET /drivers/me/deliveries — Historique de mes livraisons
   * ============================================================ */
  app.get("/me/deliveries", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const driver = await prisma.driver.findUnique({ where: { user_id: userId }, select: { id: true } });

    if (!driver) {
      return reply.status(404).send({ error: "Profil livreur introuvable", code: "DRIVER_NOT_FOUND" });
    }

    const page = parseInt((request.query as Record<string, string>)["page"] ?? "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const [deliveries, total] = await Promise.all([
      prisma.order.findMany({
        where: { driver_id: driver.id, status: { in: ["picked_up", "delivered", "cancelled"] } },
        select: {
          id: true, status: true, delivery_fee: true, order_type: true,
          delivered_at: true, created_at: true,
          restaurant: { select: { name: true, address: true } },
          _count: { select: { items: true } },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where: { driver_id: driver.id } }),
    ]);

    return reply.status(200).send({
      deliveries: deliveries.map((d) => ({
        ...d,
        driver_earnings_fcfa: d.status === "delivered"
          ? Math.round(d.delivery_fee * DRIVER_SHARE)
          : 0,
        delivered_at: d.delivered_at?.toISOString() ?? null,
        created_at: d.created_at.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
      commission_percent: PLATFORM_COMMISSION * 100,
    });
  });

  /* ============================================================
   * GET /drivers/me/earnings — Récapitulatif des gains + versements
   * Retourne : gains totaux, gains non versés, demandes de versement.
   * ============================================================ */
  app.get("/me/earnings", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const driver = await prisma.driver.findUnique({ where: { user_id: userId }, select: { id: true } });

    if (!driver) {
      return reply.status(404).send({ error: "Profil livreur introuvable", code: "DRIVER_NOT_FOUND" });
    }

    /* Calculer les gains sur différentes périodes */
    const now = new Date();

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); /* Début de semaine (dimanche) */
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalEarnings, weekEarnings, monthEarnings, paidOut] = await Promise.all([
      calcEarnings(driver.id),
      calcEarnings(driver.id, weekStart, now),
      calcEarnings(driver.id, monthStart, now),
      calcPaidOut(driver.id),
    ]);

    /* Solde disponible = gains totaux nets - déjà versé - en attente de versement */
    const pendingPayouts = await prisma.driverPayout.aggregate({
      where: { driver_id: driver.id, status: { in: ["pending", "processing"] } },
      _sum: { amount_fcfa: true },
    });
    const pendingAmount = pendingPayouts._sum.amount_fcfa ?? 0;
    const availableBalance = Math.max(0, totalEarnings.net - paidOut - pendingAmount);

    /* Historique des demandes de versement */
    const payoutHistory = await prisma.driverPayout.findMany({
      where: { driver_id: driver.id },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        id: true, amount_fcfa: true, deliveries_count: true,
        period_from: true, period_to: true, payment_method: true,
        phone_number: true, status: true, processed_at: true, created_at: true,
      },
    });

    return reply.status(200).send({
      summary: {
        total_gross_fcfa: totalEarnings.gross,
        total_net_fcfa:   totalEarnings.net,
        total_deliveries: totalEarnings.count,
        paid_out_fcfa:    paidOut,
        pending_payout_fcfa: pendingAmount,
        available_balance_fcfa: availableBalance,
        can_request_payout: availableBalance >= MIN_PAYOUT_FCFA,
        min_payout_fcfa: MIN_PAYOUT_FCFA,
        commission_percent: PLATFORM_COMMISSION * 100,
      },
      this_week: {
        net_fcfa: weekEarnings.net,
        deliveries: weekEarnings.count,
      },
      this_month: {
        net_fcfa: monthEarnings.net,
        deliveries: monthEarnings.count,
      },
      payout_history: payoutHistory.map((p) => ({
        ...p,
        period_from: p.period_from.toISOString(),
        period_to: p.period_to.toISOString(),
        processed_at: p.processed_at?.toISOString() ?? null,
        created_at: p.created_at.toISOString(),
      })),
    });
  });

  /* ============================================================
   * POST /drivers/me/payout — Demander un versement automatique
   *
   * Le livreur spécifie la période → le montant est calculé depuis ses
   * livraisons. Le virement est déclenché immédiatement via le
   * PayoutProviderRegistry (CinetPay Transfer) — aucune intervention admin.
   * ============================================================ */
  app.post("/me/payout", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const driver = await prisma.driver.findUnique({
      where: { user_id: userId },
      select: { id: true, application_status: true },
    });

    if (!driver || driver.application_status !== "approved") {
      return reply.status(403).send({
        error: "Seuls les livreurs approuvés peuvent demander un versement",
        code: "DRIVER_NOT_APPROVED",
      });
    }

    const parseResult = PayoutRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { period_from, period_to, payment_method, phone_number } = parseResult.data;

    if (period_from >= period_to) {
      return reply.status(422).send({ error: "Période invalide", code: "INVALID_DATES" });
    }

    /* Calculer les gains sur la période */
    const earnings = await calcEarnings(
      driver.id,
      new Date(period_from),
      new Date(period_to + "T23:59:59Z")
    );

    if (earnings.count === 0) {
      return reply.status(422).send({
        error: "Aucune livraison trouvée sur cette période",
        code: "NO_DELIVERIES_IN_PERIOD",
      });
    }

    if (earnings.net < MIN_PAYOUT_FCFA) {
      return reply.status(422).send({
        error: `Minimum de versement : ${MIN_PAYOUT_FCFA.toLocaleString("fr-FR")} FCFA`,
        code: "BELOW_MIN_PAYOUT",
        details: { available: earnings.net, minimum: MIN_PAYOUT_FCFA },
      });
    }

    /* Vérifier qu'il n'y a pas déjà une demande pending sur cette période */
    const overlap = await prisma.driverPayout.findFirst({
      where: {
        driver_id: driver.id,
        status: { in: ["pending", "processing"] },
        period_from: { lte: new Date(period_to) },
        period_to: { gte: new Date(period_from) },
      },
    });
    if (overlap) {
      return reply.status(409).send({
        error: "Une demande de versement est déjà en cours sur cette période",
        code: "PAYOUT_OVERLAP",
      });
    }

    /* Vérifier que la méthode de paiement est supportée avant de créer le record */
    try {
      payoutRegistry.get(payment_method);
    } catch {
      return reply.status(422).send({
        error: `Méthode de paiement "${payment_method}" non supportée`,
        code: "UNSUPPORTED_PAYMENT_METHOD",
        details: { supported: payoutRegistry.supportedMethods() },
      });
    }

    const payout = await prisma.driverPayout.create({
      data: {
        driver_id:        driver.id,
        amount_fcfa:      earnings.net,
        deliveries_count: earnings.count,
        period_from:      new Date(period_from),
        period_to:        new Date(period_to + "T23:59:59Z"),
        payment_method,
        phone_number,
        status: "processing", /* Statut initial — le virement est déclenché immédiatement */
      },
      select: {
        id: true, amount_fcfa: true, deliveries_count: true,
        payment_method: true, phone_number: true, status: true, created_at: true,
      },
    });

    /*
     * Déclencher le virement en arrière-plan (fire-and-forget).
     * La réponse HTTP ne attend pas la fin du virement — le statut est
     * mis à jour de manière asynchrone dans la base de données.
     * En cas d'échec, le statut passe à "failed" avec failure_reason.
     */
    void dispatchPayout(payout.id);

    return reply.status(201).send({
      ...payout,
      created_at: payout.created_at.toISOString(),
      message: "Versement en cours. Vous recevrez l'argent sous quelques minutes.",
    });
  });

  /* ============================================================
   * GET /drivers — Admin : liste des candidatures avec filtres
   * ============================================================ */
  app.get("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const query = request.query as Record<string, string>;
    const status = query["status"] ?? "pending"; /* pending | approved | rejected */
    const page = parseInt(query["page"] ?? "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        where: { application_status: status },
        select: {
          id: true, driver_type: true, vehicle_type: true, vehicle_plate: true,
          license_number: true, documents: true, is_approved: true,
          application_status: true, rejection_reason: true,
          payout_phone: true, payout_method: true, created_at: true,
          user: { select: { first_name: true, last_name: true, phone: true } },
          city: { select: { name: true } },
        },
        orderBy: { created_at: status === "pending" ? "asc" : "desc" }, /* Plus ancien en premier pour les pending */
        take: limit,
        skip: offset,
      }),
      prisma.driver.count({ where: { application_status: status } }),
    ]);

    return reply.status(200).send({
      drivers: drivers.map((d) => ({
        ...d,
        created_at: d.created_at.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * PATCH /drivers/:id/approve — Admin : approuver un dossier
   * ============================================================ */
  app.patch("/:id/approve", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };

    const driver = await prisma.driver.findUnique({
      where: { id },
      select: { id: true, application_status: true },
    });

    if (!driver) {
      return reply.status(404).send({ error: "Livreur introuvable", code: "DRIVER_NOT_FOUND" });
    }

    if (driver.application_status === "approved") {
      return reply.status(409).send({ error: "Dossier déjà approuvé", code: "ALREADY_APPROVED" });
    }

    await prisma.driver.update({
      where: { id },
      data: {
        application_status: "approved",
        is_approved: true,
        rejection_reason: null,
      },
    });

    return reply.status(200).send({
      message: "Dossier approuvé — le livreur peut maintenant accepter des courses",
      driver_id: id,
    });
  });

  /* ============================================================
   * PATCH /drivers/:id/reject — Admin : rejeter un dossier
   * ============================================================ */
  app.patch("/:id/reject", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };
    const parseResult = RejectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Raison de rejet requise", code: "VALIDATION_ERROR" });
    }

    await prisma.driver.update({
      where: { id },
      data: {
        application_status: "rejected",
        is_approved: false,
        rejection_reason: parseResult.data.reason,
      },
    });

    return reply.status(200).send({ message: "Dossier rejeté", driver_id: id });
  });

  /* ============================================================
   * POST /drivers/payouts/:payoutId/retry — Admin : relancer un versement échoué
   *
   * Utilisé quand un versement est en status "failed" (ex : numéro incorrect,
   * compte bloqué). Le retry re-déclenche dispatchPayout().
   * L'admin peut aussi ajouter une note interne avant le retry.
   * ============================================================ */
  app.post("/payouts/:payoutId/retry", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { payoutId } = request.params as { payoutId: string };
    const body = request.body as { admin_note?: string; phone_number?: string } | null;

    const payout = await prisma.driverPayout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true },
    });

    if (!payout) {
      return reply.status(404).send({ error: "Versement introuvable", code: "NOT_FOUND" });
    }

    if (payout.status === "paid") {
      return reply.status(409).send({ error: "Ce versement est déjà payé", code: "ALREADY_PAID" });
    }

    /* Optionnellement corriger le numéro de téléphone avant le retry */
    const updateData: Record<string, unknown> = {
      status:         "processing",
      failure_reason: null,
    };
    if (body?.admin_note) updateData["admin_note"] = body.admin_note;
    if (body?.phone_number) updateData["phone_number"] = body.phone_number;

    await prisma.driverPayout.update({ where: { id: payoutId }, data: updateData });

    /* Relancer le virement en arrière-plan */
    void dispatchPayout(payoutId);

    return reply.status(200).send({ message: "Versement relancé", payout_id: payoutId });
  });

  /* ============================================================
   * POST /drivers/payouts/:payoutId/refresh — Actualiser le statut
   *
   * Interroge l'opérateur pour vérifier si un virement "processing"
   * est finalement passé. Utile si le webhook n'est pas reçu.
   * ============================================================ */
  app.post("/payouts/:payoutId/refresh", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { payoutId } = request.params as { payoutId: string };
    await refreshPayoutStatus(payoutId);

    const updated = await prisma.driverPayout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, provider_transaction_id: true, failure_reason: true },
    });

    return reply.status(200).send(updated);
  });
};
