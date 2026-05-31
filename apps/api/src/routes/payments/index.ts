/**
 * routes/payments/index.ts — Module paiement CinetPay VIVRE
 *
 * Trois endpoints :
 *
 *   POST /payments/initiate   (auth requise)
 *     Crée un enregistrement Payment, appelle CinetPay, retourne payment_url.
 *     Le frontend redirige immédiatement le client sur payment_url.
 *
 *   POST /payments/webhook    (public — appelé par CinetPay)
 *     Reçoit l'IPN CinetPay, vérifie le paiement via l'API check (jamais
 *     confiance au seul payload IPN), puis met à jour Payment + entité liée.
 *
 *   GET /payments/:id/status  (auth requise)
 *     Permet au frontend de poller le statut depuis la page /paiement/retour.
 *
 * COMMISSION PLATEFORME :
 *   VIVRE prélève 12% sur chaque transaction (configurable via PLATFORM_COMMISSION_PERCENT).
 *   Le reste (88%) est reversé au fournisseur lors du règlement périodique.
 *
 * ENTITÉS SUPPORTÉES :
 *   "food"      → Order
 *   "property"  → PropertyBooking
 *   "transport" → TransportBooking
 *   "event"     → EventBooking
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import {
  initiateCinetPayPayment,
  verifyCinetPayPayment,
  buildReturnUrl,
  buildNotifyUrl,
} from "../../services/payment.service.js";
import { notifyPaymentConfirmed } from "../../services/notification.service.js";

/* Commission VIVRE — pourcentage prélevé sur chaque transaction */
const PLATFORM_COMMISSION = Number(process.env["PLATFORM_COMMISSION_PERCENT"] ?? 12) / 100;

/* ============================================================
 * HELPERS
 * ============================================================ */

/**
 * Charge l'entité liée au paiement et retourne les infos nécessaires.
 * Vérifie que l'entité existe, appartient à l'utilisateur, et n'est pas
 * déjà payée.
 */
async function resolveBookingEntity(
  bookingType: string,
  bookingId: string,
  userId: string
): Promise<{ amount: number; description: string } | null> {
  switch (bookingType) {
    case "food": {
      const order = await prisma.order.findFirst({
        where: { id: bookingId, user_id: userId, status: "pending_payment" },
        select: { total_amount: true, restaurant: { select: { name: true } } },
      });
      if (!order) return null;
      return {
        amount:      order.total_amount,
        description: `Commande VIVRE Food — ${order.restaurant.name}`,
      };
    }

    case "property": {
      const booking = await prisma.propertyBooking.findFirst({
        where: { id: bookingId, user_id: userId, status: "pending_payment" },
        select: { total_amount: true, property: { select: { name: true } } },
      });
      if (!booking) return null;
      return {
        amount:      booking.total_amount,
        description: `Réservation hébergement — ${booking.property.name}`,
      };
    }

    case "transport": {
      const booking = await prisma.transportBooking.findFirst({
        where: { id: bookingId, user_id: userId, status: "pending_payment" },
        select: {
          total_amount: true,
          trip: {
            select: {
              route: {
                select: {
                  origin_city:      { select: { name: true } },
                  destination_city: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      if (!booking) return null;
      const origin = booking.trip.route.origin_city.name;
      const dest   = booking.trip.route.destination_city.name;
      return {
        amount:      booking.total_amount,
        description: `Billet VIVRE Transport — ${origin} → ${dest}`,
      };
    }

    case "event": {
      const booking = await prisma.eventBooking.findFirst({
        where: { id: bookingId, user_id: userId },
        select: { total_amount: true, event: { select: { title: true } } },
      });
      if (!booking) return null;
      return {
        amount:      booking.total_amount,
        description: `Billets VIVRE — ${booking.event.title}`,
      };
    }

    default:
      return null;
  }
}

/**
 * Met à jour le statut de l'entité liée après confirmation du paiement.
 * Chaque type de réservation passe dans son propre statut "confirmé".
 */
async function confirmBookingEntity(
  bookingType: string,
  bookingId: string,
  paymentId: string
): Promise<void> {
  switch (bookingType) {
    case "food":
      /* pending_payment → pending : commande payée, attend confirmation du restaurant */
      await prisma.order.update({
        where: { id: bookingId },
        data:  { status: "pending", payment_id: paymentId },
      });
      break;

    case "property":
      /* pending_payment → pending : réservation payée, attend confirmation de l'hôtel */
      await prisma.propertyBooking.update({
        where: { id: bookingId },
        data:  { status: "pending", payment_id: paymentId },
      });
      break;

    case "transport":
      /* pending_payment → confirmed : paiement suffit pour confirmer le billet */
      await prisma.transportBooking.update({
        where: { id: bookingId },
        data:  { status: "confirmed", payment_id: paymentId },
      });
      break;

    case "event":
      /* event bookings ont leur propre logique de statut */
      await prisma.eventBooking.update({
        where: { id: bookingId },
        data:  { payment_id: paymentId },
      });
      break;

    case "wallet_topup": {
      /* bookingId = user_id (set at creation time) */
      const pay = await prisma.payment.findUnique({
        where:  { id: paymentId },
        select: { amount: true },
      });
      if (!pay) break;
      const wallet = await prisma.vivreWallet.upsert({
        where:  { user_id: bookingId },
        create: { user_id: bookingId, balance_fcfa: pay.amount },
        update: { balance_fcfa: { increment: pay.amount } },
      });
      await prisma.walletTransaction.create({
        data: {
          wallet_id:   wallet.id,
          amount_fcfa: pay.amount,
          type:        "topup",
          description: `Recharge portefeuille — ${pay.amount.toLocaleString()} FCFA`,
        },
      });
      break;
    }
  }
}

/**
 * Marque l'entité comme annulée si le paiement a échoué.
 * Libère les seats/chambres réservés.
 */
async function cancelBookingEntity(
  bookingType: string,
  bookingId: string
): Promise<void> {
  const cancelledAt = new Date();
  switch (bookingType) {
    case "food":
      await prisma.order.update({
        where: { id: bookingId },
        data:  { status: "cancelled", cancelled_at: cancelledAt },
      });
      break;
    case "property":
      await prisma.propertyBooking.update({
        where: { id: bookingId },
        data:  { status: "cancelled", cancelled_at: cancelledAt },
      });
      break;
    case "transport":
      await prisma.transportBooking.update({
        where: { id: bookingId },
        data:  { status: "cancelled", cancelled_at: cancelledAt },
      });
      break;
  }
}

/* ============================================================
 * ROUTES
 * ============================================================ */

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {

  /* ----------------------------------------------------------
   * POST /payments/initiate
   * Démarre un paiement CinetPay pour une réservation existante.
   *
   * Body : { booking_type: string, booking_id: string }
   * Returns : { payment_id, payment_url, amount_fcfa }
   * ---------------------------------------------------------- */
  app.post("/initiate", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const body   = request.body as Record<string, unknown>;

    const bookingType = body["booking_type"] as string | undefined;
    const bookingId   = body["booking_id"]   as string | undefined;

    if (!bookingType || !bookingId) {
      return reply.status(422).send({
        error: "booking_type et booking_id sont requis",
        code:  "VALIDATION_ERROR",
      });
    }

    /* Charger l'entité et vérifier qu'elle appartient à ce user */
    const entity = await resolveBookingEntity(bookingType, bookingId, userId);
    if (!entity) {
      return reply.status(404).send({
        error: "Réservation introuvable, déjà payée, ou non autorisée",
        code:  "BOOKING_NOT_FOUND",
      });
    }

    /* Charger les infos du client pour CinetPay */
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { first_name: true, last_name: true, phone: true, email: true },
    });
    if (!user) {
      return reply.status(401).send({ error: "Utilisateur introuvable", code: "AUTH_ERROR" });
    }

    /* Créer l'enregistrement Payment dans notre base */
    const platformFee    = Math.round(entity.amount * PLATFORM_COMMISSION);
    const supplierAmount = entity.amount - platformFee;

    const payment = await prisma.payment.create({
      data: {
        user_id:         userId,
        amount:          entity.amount,
        currency:        "XOF",
        payment_method:  "orange_money",   /* Sera mis à jour par le webhook avec la vraie méthode */
        status:          "pending",
        booking_type:    bookingType,
        booking_id:      bookingId,
        platform_fee:    platformFee,
        supplier_amount: supplierAmount,
      },
    });

    /* Appeler CinetPay — peut lever une erreur si les credentials sont absents */
    let paymentUrl: string;
    let paymentToken: string;
    try {
      /* exactOptionalPropertyTypes : n'inclure customerEmail que si l'email existe */
      const emailParam = user.email ? { customerEmail: user.email } : {};
      const result = await initiateCinetPayPayment({
        transactionId: payment.id,
        amountFcfa:    entity.amount,
        description:   entity.description,
        customerName:  `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Client VIVRE",
        customerPhone: user.phone,
        returnUrl:     buildReturnUrl(payment.id),
        notifyUrl:     buildNotifyUrl(),
        ...emailParam,
      });
      paymentUrl   = result.paymentUrl;
      paymentToken = result.paymentToken;
    } catch (err) {
      /* Si CinetPay est indisponible, supprimer le Payment orphelin */
      await prisma.payment.delete({ where: { id: payment.id } });
      app.log.error({ err }, "CinetPay initiation failed");
      return reply.status(502).send({
        error: "Le service de paiement est temporairement indisponible. Réessayez dans quelques instants.",
        code:  "PAYMENT_GATEWAY_ERROR",
      });
    }

    /* Stocker le payment_token CinetPay pour référence */
    await prisma.payment.update({
      where: { id: payment.id },
      data:  { provider_ref: paymentToken },
    });

    return reply.status(201).send({
      payment_id:  payment.id,
      payment_url: paymentUrl,
      amount_fcfa: entity.amount,
    });
  });

  /* ----------------------------------------------------------
   * POST /payments/webhook
   * IPN CinetPay — appelé par CinetPay quand un paiement est finalisé.
   *
   * IMPORTANT : cette route est publique (pas d'auth JWT).
   * La sécurité repose sur la vérification via l'API check CinetPay —
   * on ne fait pas confiance au payload seul.
   *
   * CinetPay envoie du form-encoded (application/x-www-form-urlencoded).
   * On parse manuellement avec URLSearchParams.
   * ---------------------------------------------------------- */
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const params: Record<string, string> = {};
        new URLSearchParams(body as string).forEach((v, k) => { params[k] = v; });
        done(null, params);
      } catch {
        done(new Error("Invalid form body"), undefined);
      }
    }
  );

  app.post("/webhook", async (request, reply) => {
    const body = request.body as Record<string, string | undefined>;

    /*
     * CinetPay envoie notre Payment.id dans cpm_trans_id.
     * C'est la valeur qu'on a passée comme transaction_id lors de l'initiation.
     */
    const transactionId = body["cpm_trans_id"];

    if (!transactionId) {
      /* CinetPay ne s'attend pas à une erreur HTTP — on répond 200 dans tous les cas */
      app.log.warn("Webhook reçu sans cpm_trans_id");
      return reply.status(200).send("OK");
    }

    /* Charger le Payment depuis notre base */
    const payment = await prisma.payment.findUnique({
      where: { id: transactionId },
    });

    if (!payment) {
      app.log.warn({ transactionId }, "Webhook : Payment introuvable");
      return reply.status(200).send("OK");
    }

    /* Ignorer les webhooks dupliqués — paiement déjà traité */
    if (payment.status === "completed" || payment.status === "failed") {
      return reply.status(200).send("OK");
    }

    /* Vérifier auprès de l'API CinetPay — source de vérité */
    let verified;
    try {
      verified = await verifyCinetPayPayment(transactionId);
    } catch (err) {
      app.log.error({ err, transactionId }, "Webhook : échec vérification CinetPay");
      return reply.status(200).send("OK");
    }

    if (verified.status === "pending") {
      /* Pas encore finalisé — CinetPay renverra un autre webhook */
      return reply.status(200).send("OK");
    }

    /* Mettre à jour le Payment */
    await prisma.payment.update({
      where: { id: transactionId },
      data: {
        status:         verified.status,
        payment_method: verified.paymentMethod ?? payment.payment_method,
        paid_at:        verified.status === "completed" ? new Date() : null,
        failed_at:      verified.status === "failed"    ? new Date() : null,
        failure_reason: verified.status === "failed"    ? (body["cpm_error_message"] ?? "Paiement refusé") : null,
      },
    });

    /* Mettre à jour l'entité liée */
    if (verified.status === "completed") {
      await confirmBookingEntity(payment.booking_type, payment.booking_id, payment.id);
    } else {
      await cancelBookingEntity(payment.booking_type, payment.booking_id);
    }

    /* Notifier le client — fire-and-forget, ne bloque pas la réponse CinetPay */
    if (verified.status === "completed") {
      const user = await prisma.user.findUnique({
        where:  { id: payment.user_id },
        select: { phone: true },
      });
      if (user) {
        void notifyPaymentConfirmed({
          userId:      payment.user_id,
          userPhone:   user.phone,
          amountFcfa:  payment.amount,
          bookingType: payment.booking_type,
          bookingId:   payment.booking_id,
        });
      }
    }

    app.log.info({ transactionId, status: verified.status, method: verified.paymentMethod }, "Paiement traité");

    /* CinetPay attend toujours HTTP 200 */
    return reply.status(200).send("OK");
  });

  /* ----------------------------------------------------------
   * GET /payments/:id/status
   * Polling depuis la page /paiement/retour — vérifie si le paiement
   * est arrivé dans notre base. On ne rappelle pas CinetPay ici :
   * le webhook a déjà mis à jour le statut.
   * ---------------------------------------------------------- */
  app.get("/:id/status", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId    = request.user.sub;
    const paymentId = (request.params as { id: string }).id;

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, user_id: userId },
      select: {
        id: true, status: true, amount: true, payment_method: true,
        booking_type: true, booking_id: true, paid_at: true, failed_at: true,
        failure_reason: true,
      },
    });

    if (!payment) {
      return reply.status(404).send({ error: "Paiement introuvable", code: "NOT_FOUND" });
    }

    return reply.send(payment);
  });

  /* ----------------------------------------------------------
   * POST /payments/wallet/topup — Recharger le portefeuille VIVRE
   * Initie un paiement CinetPay dont le webhook créditera le wallet.
   * ---------------------------------------------------------- */
  app.post("/wallet/topup", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const { amount, payment_method } = request.body as { amount: number; payment_method: string };

    if (!amount || amount < 500 || amount > 500_000) {
      return reply.status(422).send({ error: "Montant invalide (500–500 000 FCFA)", code: "VALIDATION_ERROR" });
    }

    const allowedMethods = ["orange_money", "moov", "telecel_money"];
    if (!allowedMethods.includes(payment_method)) {
      return reply.status(422).send({ error: "Méthode de paiement non supportée", code: "VALIDATION_ERROR" });
    }

    /* Créer un enregistrement Payment de type "wallet_topup" */
    const payment = await prisma.payment.create({
      data: {
        user_id:          userId,
        amount,
        platform_fee:     0,
        supplier_amount:  amount,
        payment_method,
        booking_type:     "wallet_topup",
        booking_id:       userId, /* référence l'utilisateur pour le webhook */
        status:           "pending",
      },
      select: { id: true },
    });

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { first_name: true, last_name: true, phone: true, email: true },
    });
    if (!user) {
      await prisma.payment.delete({ where: { id: payment.id } });
      return reply.status(401).send({ error: "Utilisateur introuvable", code: "AUTH_ERROR" });
    }

    let checkoutUrl: string;
    try {
      const emailParam = user.email ? { customerEmail: user.email } : {};
      const result = await initiateCinetPayPayment({
        transactionId: payment.id,
        amountFcfa:    amount,
        description:   "Recharge portefeuille VIVRE",
        customerName:  `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Client VIVRE",
        customerPhone: user.phone,
        returnUrl:     buildReturnUrl(payment.id),
        notifyUrl:     buildNotifyUrl(),
        ...emailParam,
      });
      checkoutUrl = result.paymentUrl;
    } catch (err) {
      await prisma.payment.delete({ where: { id: payment.id } });
      app.log.error({ err }, "CinetPay wallet topup initiation failed");
      return reply.status(502).send({
        error: "Le service de paiement est temporairement indisponible. Réessayez dans quelques instants.",
        code:  "PAYMENT_GATEWAY_ERROR",
      });
    }

    return reply.status(200).send({
      payment_id:   payment.id,
      checkout_url: checkoutUrl,
    });
  });

  /* ----------------------------------------------------------
   * POST /payments/wallet/pay — Payer une réservation avec le portefeuille
   *
   * Flux entièrement interne : pas de redirection CinetPay.
   * Transaction atomique : vérification solde → débit → confirmation entité.
   *
   * Body : { booking_type: string, booking_id: string }
   * Returns : { payment_id, amount_fcfa, booking_type, booking_id }
   * ---------------------------------------------------------- */
  app.post("/wallet/pay", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const body   = request.body as Record<string, unknown>;

    const bookingType = body["booking_type"] as string | undefined;
    const bookingId   = body["booking_id"]   as string | undefined;

    if (!bookingType || !bookingId) {
      return reply.status(422).send({
        error: "booking_type et booking_id sont requis",
        code:  "VALIDATION_ERROR",
      });
    }

    /* Résoudre l'entité pour obtenir le montant */
    const entity = await resolveBookingEntity(bookingType, bookingId, userId);
    if (!entity) {
      return reply.status(404).send({
        error: "Réservation introuvable, déjà payée, ou non autorisée",
        code:  "BOOKING_NOT_FOUND",
      });
    }

    /* Vérifier le solde du portefeuille */
    const wallet = await prisma.vivreWallet.findUnique({
      where:  { user_id: userId },
      select: { id: true, balance_fcfa: true },
    });

    if (!wallet || wallet.balance_fcfa < entity.amount) {
      return reply.status(402).send({
        error: "Solde insuffisant dans le portefeuille VIVRE",
        code:  "INSUFFICIENT_WALLET_BALANCE",
        balance_fcfa: wallet?.balance_fcfa ?? 0,
        required_fcfa: entity.amount,
      });
    }

    const platformFee    = Math.round(entity.amount * PLATFORM_COMMISSION);
    const supplierAmount = entity.amount - platformFee;

    /* Transaction atomique — débit + confirmation */
    const payment = await prisma.$transaction(async (tx) => {
      /* 1. Débiter le portefeuille */
      await tx.vivreWallet.update({
        where: { id: wallet.id },
        data:  { balance_fcfa: { decrement: entity.amount } },
      });

      /* 2. Enregistrer le mouvement */
      await tx.walletTransaction.create({
        data: {
          wallet_id:   wallet.id,
          amount_fcfa: -entity.amount,
          type:        "booking_payment",
          reference_id: bookingId,
          description: entity.description,
        },
      });

      /* 3. Créer l'enregistrement Payment (statut completed d'emblée) */
      const pay = await tx.payment.create({
        data: {
          user_id:         userId,
          amount:          entity.amount,
          currency:        "XOF",
          payment_method:  "wallet",
          status:          "completed",
          booking_type:    bookingType,
          booking_id:      bookingId,
          platform_fee:    platformFee,
          supplier_amount: supplierAmount,
          paid_at:         new Date(),
        },
      });

      return pay;
    });

    /* 4. Confirmer l'entité (hors transaction — les mises à jour de statut sont idempotentes) */
    await confirmBookingEntity(bookingType, bookingId, payment.id);

    app.log.info({ userId, bookingType, bookingId, amount: entity.amount }, "Paiement portefeuille effectué");

    return reply.status(201).send({
      payment_id:   payment.id,
      amount_fcfa:  entity.amount,
      booking_type: bookingType,
      booking_id:   bookingId,
    });
  });
}
