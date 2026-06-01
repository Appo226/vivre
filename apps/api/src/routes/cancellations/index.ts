/**
 * routes/cancellations/index.ts — Annulations et remboursements VIVRE
 *
 * Endpoints :
 *   POST /transport-bookings/:id/cancel   — Annuler un billet de bus
 *   POST /property-bookings/:id/cancel    — Annuler une réservation hôtel
 *   POST /orders/:id/cancel              — Annuler une commande (avant préparation)
 *   POST /event-bookings/:id/cancel      — Annuler un billet d'événement
 *   POST /event-bookings/:id/transfer    — Transférer un billet à un autre utilisateur
 *   GET  /users/me/wallet                — Solde et historique du portefeuille VIVRE
 *   POST /admin/refunds/:id/process      — Traiter un remboursement mobile money (admin)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate, requireRole } from "../../plugins/authenticate.js";
import {
  computeRefundAmount,
  executeRefund,
  hoursUntil,
  type RefundMethod,
} from "../../services/cancellation.service.js";
import { notifyBookingCancelled } from "../../services/notification.service.js";
import { dispatchMobileMoneyRefund } from "../../services/payout.service.js";

const refundMethodSchema = z.enum(["vivre_credit", "mobile_money"]).default("vivre_credit");

export const cancellationRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * TRANSPORT — Annuler un billet de bus
   * ============================================================ */

  app.post("/transport-bookings/:id/cancel", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { reason, refund_method } = z
      .object({
        reason: z.string().max(500).optional(),
        refund_method: refundMethodSchema,
      })
      .parse(request.body);

    const booking = await prisma.transportBooking.findUnique({
      where: { id },
      include: {
        payment: true,
        trip: { include: { route: true } },
      },
    });

    if (!booking || booking.user_id !== userId) {
      return reply.status(404).send({ error: "Réservation introuvable", code: "NOT_FOUND" });
    }
    if (booking.status === "cancelled") {
      return reply.status(409).send({ error: "Réservation déjà annulée", code: "ALREADY_CANCELLED" });
    }
    if (booking.status === "completed") {
      return reply.status(409).send({ error: "Impossible d'annuler un trajet terminé", code: "BOOKING_COMPLETED" });
    }
    if (!booking.payment || booking.payment.status !== "completed") {
      /* Pas encore payé — annuler sans remboursement */
      await prisma.transportBooking.update({
        where: { id },
        data: { status: "cancelled", cancelled_at: new Date(), cancellation_reason: reason ?? "Annulé par l'utilisateur" },
      });
      await prisma.trip.update({
        where: { id: booking.trip_id },
        data: { available_seats: { increment: booking.passenger_count } },
      });
      void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
        if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "transport", bookingId: id, refundAmount: 0, refundMethod: null });
      });
      return reply.send({ cancelled: true, refund_amount: 0, message: "Réservation annulée." });
    }

    const route = booking.trip.route;
    const hours = hoursUntil(booking.trip.departure_datetime);
    const calc = computeRefundAmount(
      {
        cancel_policy: route.cancel_policy,
        cancel_full_refund_h: route.cancel_full_refund_h,
        cancel_partial_h: route.cancel_partial_h,
        cancel_partial_pct: route.cancel_partial_pct,
      },
      booking.payment.supplier_amount,
      hours
    );

    /* Annuler la réservation + libérer les sièges */
    await prisma.transportBooking.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelled_at: new Date(),
        cancellation_reason: reason ?? calc.policy_label,
      },
    });
    await prisma.trip.update({
      where: { id: booking.trip_id },
      data: { available_seats: { increment: booking.passenger_count } },
    });

    if (calc.refund_amount > 0) {
      await executeRefund({
        paymentId: booking.payment.id,
        userId,
        amount: calc.refund_amount,
        reason: reason ?? calc.policy_label,
        method: refund_method as RefundMethod,
        bookingType: "transport",
        bookingId: id,
        description: `Remboursement billet bus — ${booking.trip.route.bus_type}`,
      });
    }

    void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
      if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "transport", bookingId: id, refundAmount: calc.refund_amount, refundMethod: calc.refund_amount > 0 ? refund_method : null });
    });

    return reply.send({
      cancelled: true,
      refund_amount: calc.refund_amount,
      refund_pct: calc.refund_pct,
      refund_method: calc.refund_amount > 0 ? refund_method : null,
      policy_label: calc.policy_label,
      message:
        calc.refund_amount > 0
          ? refund_method === "vivre_credit"
            ? `${calc.refund_amount} FCFA crédités sur votre portefeuille VIVRE.`
            : `Remboursement de ${calc.refund_amount} FCFA en cours de traitement (24–48h).`
          : "Annulé sans remboursement selon la politique en vigueur.",
    });
  });

  /* ============================================================
   * PROPERTY — Annuler une réservation hôtel
   * ============================================================ */

  app.post("/property-bookings/:id/cancel", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { reason, refund_method } = z
      .object({
        reason: z.string().max(500).optional(),
        refund_method: refundMethodSchema,
      })
      .parse(request.body);

    const booking = await prisma.propertyBooking.findUnique({
      where: { id },
      include: { payment: true, property: true },
    });

    if (!booking || booking.user_id !== userId) {
      return reply.status(404).send({ error: "Réservation introuvable", code: "NOT_FOUND" });
    }
    if (booking.status === "cancelled") {
      return reply.status(409).send({ error: "Réservation déjà annulée", code: "ALREADY_CANCELLED" });
    }
    if (booking.status === "completed") {
      return reply.status(409).send({ error: "Impossible d'annuler un séjour terminé", code: "BOOKING_COMPLETED" });
    }
    if (!booking.payment || booking.payment.status !== "completed") {
      await prisma.propertyBooking.update({
        where: { id },
        data: { status: "cancelled", cancelled_at: new Date(), cancellation_reason: reason ?? "Annulé par l'utilisateur" },
      });
      void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
        if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "property", bookingId: id, refundAmount: 0, refundMethod: null });
      });
      return reply.send({ cancelled: true, refund_amount: 0, message: "Réservation annulée." });
    }

    /* Heures jusqu'au check-in */
    const checkInDate = new Date(booking.check_in_date + "T" + (booking.property.check_in_time ?? "14:00") + ":00");
    const hours = hoursUntil(checkInDate);

    const prop = booking.property;
    const calc = computeRefundAmount(
      {
        cancel_policy: prop.cancel_policy,
        cancel_full_refund_h: prop.cancel_full_refund_h,
        cancel_partial_h: prop.cancel_partial_h,
        cancel_partial_pct: prop.cancel_partial_pct,
      },
      booking.payment.supplier_amount,
      hours
    );

    await prisma.propertyBooking.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelled_at: new Date(),
        cancellation_reason: reason ?? calc.policy_label,
      },
    });

    if (calc.refund_amount > 0) {
      await executeRefund({
        paymentId: booking.payment.id,
        userId,
        amount: calc.refund_amount,
        reason: reason ?? calc.policy_label,
        method: refund_method as RefundMethod,
        bookingType: "property",
        bookingId: id,
        description: `Remboursement annulation — ${booking.property.name}`,
      });
    }

    void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
      if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "property", bookingId: id, refundAmount: calc.refund_amount, refundMethod: calc.refund_amount > 0 ? refund_method : null });
    });

    return reply.send({
      cancelled: true,
      refund_amount: calc.refund_amount,
      refund_pct: calc.refund_pct,
      refund_method: calc.refund_amount > 0 ? refund_method : null,
      policy_label: calc.policy_label,
      message:
        calc.refund_amount > 0
          ? refund_method === "vivre_credit"
            ? `${calc.refund_amount} FCFA crédités sur votre portefeuille VIVRE.`
            : `Remboursement de ${calc.refund_amount} FCFA en cours (24–48h).`
          : "Annulé sans remboursement selon la politique de l'établissement.",
    });
  });

  /* ============================================================
   * ORDER — Annuler une commande (avant que le restaurant accepte)
   * ============================================================ */

  app.post("/orders/:id/cancel", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});

    const order = await prisma.order.findUnique({
      where: { id },
      include: { payment: true },
    });

    if (!order || order.user_id !== userId) {
      return reply.status(404).send({ error: "Commande introuvable", code: "NOT_FOUND" });
    }
    if (order.status === "cancelled") {
      return reply.status(409).send({ error: "Commande déjà annulée", code: "ALREADY_CANCELLED" });
    }
    /* Annulation possible uniquement en attente de paiement ou avant acceptation restaurant */
    const cancellableStatuses = ["pending_payment", "pending"];
    if (!cancellableStatuses.includes(order.status)) {
      return reply.status(409).send({
        error: "Impossible d'annuler : le restaurant prépare déjà votre commande",
        code: "TOO_LATE_TO_CANCEL",
        details: { current_status: order.status },
      });
    }

    await prisma.order.update({
      where: { id },
      data: { status: "cancelled", cancelled_at: new Date() },
    });

    /* Remboursement intégral si déjà payé — toujours en vivre_credit pour rapidité */
    let refundAmount = 0;
    if (order.payment && order.payment.status === "completed") {
      refundAmount = order.payment.supplier_amount;
      await executeRefund({
        paymentId: order.payment.id,
        userId,
        amount: refundAmount,
        reason: reason ?? "Commande annulée avant préparation",
        method: "vivre_credit",
        bookingType: "food",
        bookingId: id,
        description: `Remboursement commande annulée`,
      });
    }

    void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
      if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "food", bookingId: id, refundAmount, refundMethod: refundAmount > 0 ? "vivre_credit" : null });
    });

    return reply.send({
      cancelled: true,
      refund_amount: refundAmount,
      refund_method: refundAmount > 0 ? "vivre_credit" : null,
      message:
        refundAmount > 0
          ? `${refundAmount} FCFA crédités sur votre portefeuille VIVRE.`
          : "Commande annulée.",
    });
  });

  /* ============================================================
   * EVENT — Annuler un billet d'événement
   * ============================================================ */

  app.post("/event-bookings/:id/cancel", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { reason, refund_method } = z
      .object({
        reason: z.string().max(500).optional(),
        refund_method: refundMethodSchema,
      })
      .parse(request.body);

    const booking = await prisma.eventBooking.findUnique({
      where: { id },
      include: { payment: true, event: true },
    });

    if (!booking || booking.user_id !== userId) {
      return reply.status(404).send({ error: "Billet introuvable", code: "NOT_FOUND" });
    }
    if (booking.status === "cancelled") {
      return reply.status(409).send({ error: "Billet déjà annulé", code: "ALREADY_CANCELLED" });
    }
    if (booking.status === "checked_in") {
      return reply.status(409).send({ error: "Billet déjà scanné à l'entrée", code: "ALREADY_USED" });
    }

    /* Vérifier si l'organisateur autorise les remboursements */
    if (!booking.event.refund_enabled) {
      return reply.status(422).send({
        error: "Ce billet est non remboursable selon la politique de l'organisateur.",
        code: "NON_REFUNDABLE",
        hint: "Vous pouvez transférer votre billet à une autre personne via /event-bookings/:id/transfer",
      });
    }

    /* Vérifier le délai */
    const hours = hoursUntil(booking.event.starts_at);
    const cutoff = booking.event.refund_cutoff_hours ?? 24;

    if (hours < cutoff) {
      return reply.status(422).send({
        error: `Le délai d'annulation est dépassé. Les remboursements ne sont plus acceptés à moins de ${cutoff}h de l'événement.`,
        code: "CANCELLATION_DEADLINE_PASSED",
        hint: "Vous pouvez transférer votre billet à une autre personne.",
      });
    }

    await prisma.eventBooking.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelled_at: new Date(),
        ...(reason !== undefined ? { cancellation_reason: reason } : {}),
      },
    });

    let refundAmount = 0;
    if (booking.payment && booking.payment.status === "completed") {
      refundAmount = booking.payment.supplier_amount;
      await executeRefund({
        paymentId: booking.payment.id,
        userId,
        amount: refundAmount,
        reason: reason ?? "Billet annulé par l'utilisateur",
        method: refund_method as RefundMethod,
        bookingType: "event",
        bookingId: id,
        description: `Remboursement billet — ${booking.event.title}`,
      });
    }

    void prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).then((u) => {
      if (u) void notifyBookingCancelled({ userId, userPhone: u.phone, bookingType: "event", bookingId: id, refundAmount, refundMethod: refundAmount > 0 ? refund_method : null });
    });

    return reply.send({
      cancelled: true,
      refund_amount: refundAmount,
      refund_method: refundAmount > 0 ? refund_method : null,
      message:
        refundAmount > 0
          ? refund_method === "vivre_credit"
            ? `${refundAmount} FCFA crédités sur votre portefeuille VIVRE.`
            : `Remboursement de ${refundAmount} FCFA en cours (24–48h).`
          : "Billet annulé.",
    });
  });

  /* ============================================================
   * EVENT — Transférer un billet à un autre utilisateur
   * ============================================================ */

  app.post("/event-bookings/:id/transfer", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;
    const { id } = request.params as { id: string };
    const { recipient_phone } = z
      .object({ recipient_phone: z.string().regex(/^\+?[0-9]{8,15}$/) })
      .parse(request.body);

    const booking = await prisma.eventBooking.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!booking || booking.user_id !== userId) {
      return reply.status(404).send({ error: "Billet introuvable", code: "NOT_FOUND" });
    }
    if (booking.status !== "confirmed") {
      return reply.status(409).send({
        error: "Seuls les billets confirmés peuvent être transférés",
        code: "INVALID_STATUS",
      });
    }
    if (booking.transferred_at) {
      return reply.status(409).send({ error: "Ce billet a déjà été transféré", code: "ALREADY_TRANSFERRED" });
    }

    /* Vérifier la deadline de transfert : jusqu'à 1h avant l'événement */
    const hours = hoursUntil(booking.event.starts_at);
    if (hours < 1) {
      return reply.status(422).send({
        error: "Le transfert n'est plus possible à moins d'1h de l'événement",
        code: "TRANSFER_DEADLINE_PASSED",
      });
    }

    /* Trouver le destinataire */
    const recipient = await prisma.user.findUnique({
      where: { phone: recipient_phone },
      select: { id: true, first_name: true, last_name: true, phone: true },
    });

    if (!recipient) {
      return reply.status(404).send({
        error: "Aucun compte VIVRE trouvé pour ce numéro. Le destinataire doit avoir un compte VIVRE.",
        code: "RECIPIENT_NOT_FOUND",
      });
    }
    if (recipient.id === userId) {
      return reply.status(422).send({ error: "Vous ne pouvez pas transférer un billet à vous-même", code: "SELF_TRANSFER" });
    }

    await prisma.eventBooking.update({
      where: { id },
      data: {
        transferred_to_id: recipient.id,
        transferred_at: new Date(),
      },
    });

    return reply.send({
      transferred: true,
      recipient: {
        phone: recipient.phone,
        name: [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") || "Utilisateur VIVRE",
      },
      message: `Billet transféré avec succès à ${recipient.phone}.`,
    });
  });

  /* ============================================================
   * WALLET — Solde et historique du portefeuille VIVRE
   * ============================================================ */

  app.get("/users/me/wallet", async (request, reply) => {
    await authenticate(request, reply);
    const userId = request.user.sub;

    const wallet = await prisma.vivreWallet.findUnique({
      where: { user_id: userId },
      include: {
        transactions: {
          orderBy: { created_at: "desc" },
          take: 20,
        },
      },
    });

    if (!wallet) {
      return reply.send({ balance_fcfa: 0, transactions: [] });
    }

    return reply.send({
      balance_fcfa: wallet.balance_fcfa,
      transactions: wallet.transactions.map((t) => ({
        id: t.id,
        amount_fcfa: t.amount_fcfa,
        type: t.type,
        description: t.description,
        created_at: t.created_at.toISOString(),
      })),
    });
  });

  /* ============================================================
   * ADMIN — Traiter un remboursement mobile money
   * ============================================================ */

  app.post("/admin/refunds/:id/process", async (request, reply) => {
    await authenticate(request, reply);
    await requireRole(request, reply, "admin");
    const adminId = request.user.sub;
    const { id } = request.params as { id: string };
    const { action, rejection_reason } = z
      .object({
        action: z.enum(["approve", "reject"]),
        rejection_reason: z.string().max(500).optional(),
      })
      .parse(request.body);

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: { payment: { select: { user_id: true } } },
    });

    if (!refund) {
      return reply.status(404).send({ error: "Remboursement introuvable", code: "NOT_FOUND" });
    }
    if (refund.status !== "pending") {
      return reply.status(409).send({ error: "Ce remboursement n'est plus en attente", code: "INVALID_STATUS" });
    }
    if (refund.refund_method !== "mobile_money") {
      return reply.status(409).send({ error: "Seuls les remboursements mobile money nécessitent un traitement manuel", code: "INVALID_METHOD" });
    }

    if (action === "approve") {
      /* Déclencher le virement mobile money via le service de payout — fire-and-forget */
      void dispatchMobileMoneyRefund(id);
      return reply.send({ processed: true, action: "approved", message: "Remboursement approuvé. Virement mobile money en cours." });
    }

    /* Reject → convertir en crédit portefeuille automatiquement si raison fournie */
    await prisma.refund.update({
      where: { id },
      data: { status: "rejected", processed_by: adminId, processed_at: new Date() },
    });

    return reply.send({
      processed: true,
      action: "rejected",
      reason: rejection_reason,
      message: "Remboursement rejeté.",
    });
  });

  /* ============================================================
   * ADMIN — Liste des remboursements en attente
   * ============================================================ */

  app.get("/admin/refunds", async (request, reply) => {
    await authenticate(request, reply);
    await requireRole(request, reply, "admin");

    const { status = "pending", method } = z
      .object({
        status: z.enum(["pending", "completed", "rejected"]).optional(),
        method: z.enum(["vivre_credit", "mobile_money"]).optional(),
      })
      .parse(request.query);

    const refunds = await prisma.refund.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(method ? { refund_method: method } : {}),
      },
      include: {
        payment: {
          select: { user_id: true, booking_type: true, booking_id: true, amount: true, payment_method: true },
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    return reply.send(
      refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        refund_method: r.refund_method,
        booking_type: r.booking_type,
        booking_id: r.booking_id,
        reason: r.reason,
        user_id: r.payment.user_id,
        payment_method: r.payment.payment_method,
        created_at: r.created_at.toISOString(),
        processed_at: r.processed_at?.toISOString() ?? null,
      }))
    );
  });
};
