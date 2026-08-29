/**
 * lib/events.ts — Utilitaires partagés par les Route Handlers /api/events/*
 */

import { randomUUID } from "crypto";
import { prisma } from "@vivre/database";
import { notify } from "@/lib/notifications";
import { sendOrangeSms } from "@/lib/otp-channel";
import { sendEmail, eventPendingApprovalEmail } from "@/lib/email";

/**
 * Notifie l'organisateur (in-app + SMS + email, best-effort chacun) une fois le paiement de
 * mise en ligne confirmé par webhook CinetPay — voir payments/webhook/route.ts et
 * events/[id]/submit/route.ts (chemin totalFcfa===0, qui notifie directement sans paiement).
 */
export async function notifyEventPendingApproval(event: {
  id: string;
  title: string;
  organizer: { id: string; phone: string; email: string | null };
}): Promise<void> {
  void notify({
    userId: event.organizer.id,
    type: "event_approved",
    title: "Paiement confirmé — événement en attente",
    body: `${event.title} est maintenant en attente d'approbation. Vous serez notifié dès la décision.`,
    data: { event_id: event.id },
  });

  sendOrangeSms(
    event.organizer.phone,
    `VIVRE : paiement confirmé pour "${event.title}". Votre événement est en attente d'approbation.`
  ).catch(() => {});

  if (event.organizer.email) {
    void sendEmail({
      to: event.organizer.email,
      subject: `Paiement confirmé — ${event.title} en attente d'approbation`,
      html: eventPendingApprovalEmail({ eventTitle: event.title }),
    });
  }
}

export type RefundEventListingResult =
  | { outcome: "created"; amountFcfa: number }
  | { outcome: "no_payment" }
  | { outcome: "already_refunded" };

/**
 * Rembourse les frais de mise en ligne (+ pub éventuelle, réglées dans le même paiement — voir
 * events/[id]/submit) d'un événement rejeté. Appelée depuis deux endroits : l'admin qui coche
 * "rembourser immédiatement" au moment du rejet, et l'organisateur qui demande lui-même un
 * remboursement depuis son événement rejeté plutôt que de le corriger et le resoumettre.
 * Idempotent — un second appel sur le même événement ne crée pas de doublon.
 */
export async function refundEventListingPayment(eventId: string): Promise<RefundEventListingResult> {
  const [payment, event] = await Promise.all([
    prisma.payment.findFirst({
      where: { booking_type: "event_listing", booking_id: eventId, status: "completed", amount: { gt: 0 } },
      select: { id: true, amount: true },
    }),
    prisma.event.findUnique({ where: { id: eventId }, select: { title: true } }),
  ]);
  if (!payment) return { outcome: "no_payment" };

  const existingRefund = await prisma.refund.findFirst({
    where: { booking_type: "event_listing", booking_id: eventId, status: { not: "rejected" } },
  });
  if (existingRefund) return { outcome: "already_refunded" };

  await prisma.refund.create({
    data: {
      payment_id: payment.id,
      amount: payment.amount,
      reason: `Événement rejeté — remboursement des frais de mise en ligne pour "${event?.title ?? eventId}"`,
      status: "pending",
      refund_method: "mobile_money",
      booking_type: "event_listing",
      booking_id: eventId,
    },
  });

  return { outcome: "created", amountFcfa: payment.amount };
}

/** Génère le slug URL d'un événement à partir de son titre et de sa date de début. */
export function generateEventSlug(title: string, startsAtIso: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // supprime les accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  const dateSuffix = startsAtIso.slice(0, 10).replace(/-/g, "");
  const unique = Date.now().toString(36);
  return `${base}-${dateSuffix}-${unique}`;
}

/** Encode les données d'UN billet individuel dans son QR code (base64 JSON). */
export function generateTicketQr(
  ticketId: string,
  eventId: string,
  userId: string,
  ticketTypeName: string
): string {
  const data = { tk: ticketId, e: eventId, u: userId, t: ticketTypeName };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/**
 * Émet les N billets individuels (EventTicket) d'une commande dès que son paiement est
 * confirmé — voir events/bookings/route.ts (gratuit), payments/webhook/route.ts (CinetPay),
 * confirm-payment/route.ts (pont manuel). Avant cette table, un seul qr_code sur EventBooking
 * représentait toute la commande ; désormais chaque billet a son propre QR, son propre
 * détenteur, et peut être transféré/annulé/scanné indépendamment des autres.
 *
 * price_fcfa_at_purchase répartit total_amount également entre les N billets, le reliquat
 * d'arrondi allant au dernier — pour que la somme retombe exactement sur le montant payé
 * (base du remboursement partiel si un seul billet est annulé plus tard).
 *
 * Idempotent : si des billets existent déjà pour cette commande (retry webhook), ne fait rien.
 * Ce retry n'est pas hypothétique — CinetPay peut renvoyer le même IPN deux fois, et deux
 * appels concurrents passeraient tous les deux le contrôle "déjà traité" du webhook avant que
 * l'un ou l'autre n'ait eu le temps d'écrire. Un simple `count() puis create()` serait alors
 * une vraie fenêtre de course (double émission de billets). Le verrou posé sur la ligne de la
 * commande AVANT de relire le compte de billets force les appels concurrents à s'exécuter l'un
 * après l'autre : le second voit alors le compte à jour et ressort sans rien faire.
 */
export async function issueTicketsForBooking(bookingId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM event_bookings WHERE id = ${bookingId} FOR UPDATE`;

    const booking = await tx.eventBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        event_id: true,
        user_id: true,
        quantity: true,
        total_amount: true,
        ticket_type: { select: { name: true } },
      },
    });
    if (!booking) return;

    const existing = await tx.eventTicket.count({ where: { booking_id: bookingId } });
    if (existing > 0) return;

    const base = Math.floor(booking.total_amount / booking.quantity);
    const remainder = booking.total_amount - base * booking.quantity;

    for (let i = 0; i < booking.quantity; i++) {
      const id = randomUUID();
      const qrCode = generateTicketQr(id, booking.event_id, booking.user_id, booking.ticket_type.name);
      await tx.eventTicket.create({
        data: {
          id,
          booking_id: booking.id,
          event_id: booking.event_id,
          user_id: booking.user_id,
          ticket_number: i + 1,
          qr_code: qrCode,
          price_fcfa_at_purchase: base + (i === booking.quantity - 1 ? remainder : 0),
        },
      });
    }
  }, {
    // Contention ici est étroite (un retry de webhook contre lui-même sur la même commande,
    // pas une foule) mais coûte peu à couvrir largement.
    maxWait: 10_000,
    timeout: 15_000,
  });
}

/** true si l'id ressemble à un UUID (sinon on le traite comme un slug). */
export function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "checked_in"];
export { ACTIVE_BOOKING_STATUSES };

// Seule fenêtre de remboursement automatique : annuler dans l'heure suivant l'émission du
// billet (pas la création de la commande "pending" — l'heure court à partir du moment où le
// billet existe vraiment, donc du paiement confirmé). Passé ce délai, l'annulation reste
// possible mais sans remboursement — évite l'incohérence précédente où l'UI promettait un
// remboursement "24h avant l'événement" que l'API ne mettait jamais en œuvre.
const REFUND_WINDOW_MS = 60 * 60 * 1000;

export function isWithinRefundWindow(ticketIssuedAt: Date): boolean {
  return Date.now() - ticketIssuedAt.getTime() <= REFUND_WINDOW_MS;
}

/**
 * Annule un sous-ensemble (ou la totalité) des billets d'une commande, et crée un
 * remboursement partiel pour chaque billet annulé dans l'heure suivant son émission. Repasse
 * la commande à "cancelled" seulement si elle n'a plus aucun billet actif — une commande
 * partiellement annulée reste "confirmed" pour ses billets restants.
 */
export async function cancelTickets(params: {
  bookingId: string;
  ticketIds: string[];
  paymentId: string | null;
}): Promise<{ refundedFcfa: number; refundCreated: boolean; cancelledTicketIds: string[] }> {
  const { bookingId, ticketIds, paymentId } = params;
  const now = new Date();

  const tickets = await prisma.eventTicket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, price_fcfa_at_purchase: true, created_at: true },
  });

  let refundedFcfa = 0;
  const cancelledTicketIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const ticket of tickets) {
      // Deux requêtes d'annulation concurrentes pour LE MÊME billet (double-clic, deux onglets,
      // retry réseau) passeraient toutes deux le contrôle de statut fait par l'appelant AVANT
      // cette fonction — sans la condition status ci-dessous, chacune créerait son propre
      // remboursement : un vrai double remboursement, de l'argent réel envoyé deux fois. La
      // condition dans le WHERE rend l'écriture elle-même la source de vérité ; seule la
      // requête qui gagne la course voit count===1 et déclenche un remboursement.
      const { count } = await tx.eventTicket.updateMany({
        where: { id: ticket.id, status: { notIn: ["cancelled", "checked_in"] } },
        data: { status: "cancelled", cancelled_at: now },
      });
      if (count === 0) continue; // déjà annulé/utilisé par une requête concurrente — rien à faire de plus
      cancelledTicketIds.push(ticket.id);

      if (paymentId && ticket.price_fcfa_at_purchase > 0 && isWithinRefundWindow(ticket.created_at)) {
        await tx.refund.create({
          data: {
            payment_id: paymentId,
            amount: ticket.price_fcfa_at_purchase,
            reason: "Annulation par l'acheteur dans l'heure suivant l'achat",
            status: "pending",
            refund_method: "mobile_money",
            booking_type: "event",
            booking_id: bookingId,
          },
        });
        refundedFcfa += ticket.price_fcfa_at_purchase;
      }
    }

    const remainingValid = await tx.eventTicket.count({
      where: { booking_id: bookingId, status: { not: "cancelled" } },
    });
    if (remainingValid === 0) {
      await tx.eventBooking.update({ where: { id: bookingId }, data: { status: "cancelled", cancelled_at: now } });
    }
  }, { maxWait: 10_000, timeout: 15_000 });

  return { refundedFcfa, refundCreated: refundedFcfa > 0, cancelledTicketIds };
}
