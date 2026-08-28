/**
 * lib/event-payout.ts — Calcul du versement organisateur (modèle de confiance graduel).
 *
 * Aucun virement n'est automatique. On calcule seulement QUAND l'organisateur devient
 * éligible à recevoir son versement — l'action de payer reste un geste manuel d'un admin
 * (voir /api/admin/payouts/[id]/pay). C'est la principale protection anti-fraude : l'argent
 * ne bouge qu'après la fin de l'événement, jamais avant.
 */

import { prisma } from "@vivre/database";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/events";
import { getPlatformSettings } from "@/lib/platform-settings";

/**
 * Date du dernier incident disqualifiant pour la confiance de cet organisateur, ou null s'il
 * n'y en a aucun. Deux types d'incidents : un événement qu'il a annulé lui-même, ou un
 * signalement acheteur non rejeté (encore en attente, ou confirmé) sur l'un de ses billets.
 * Un signalement rejeté par l'admin (jugé non fondé) ne compte PAS contre lui.
 */
async function getLastTrustIncident(organizerId: string): Promise<Date | null> {
  const lastCancellation = await prisma.event.findFirst({
    where: { organizer_id: organizerId, cancelled_at: { not: null } },
    orderBy: { cancelled_at: "desc" },
    select: { cancelled_at: true },
  });

  const organizerBookings = await prisma.eventBooking.findMany({
    where: { event: { organizer_id: organizerId } },
    select: { id: true },
  });
  const bookingIds = organizerBookings.map((b: (typeof organizerBookings)[number]) => b.id);

  const lastDispute =
    bookingIds.length > 0
      ? await prisma.refund.findFirst({
          where: { booking_type: "event", booking_id: { in: bookingIds }, status: { not: "rejected" } },
          orderBy: { created_at: "desc" },
          select: { created_at: true },
        })
      : null;

  const dates = [lastCancellation?.cancelled_at, lastDispute?.created_at].filter(
    (d): d is Date => d != null
  );
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/**
 * Nombre d'événements PAYANTS déjà versés avec succès à cet organisateur — base de confiance.
 *
 * Exclut volontairement les versements à 0 FCFA (événements gratuits, ou sans réservation) :
 * sans argent réel en jeu, "réussir" un événement gratuit ne prouve rien sur la fiabilité
 * d'un organisateur à gérer de l'argent. Sans ce filtre, quelqu'un pourrait enchaîner 3
 * événements gratuits (auto-publiés, aucune vérification) pour débloquer artificiellement
 * le palier de confiance rapide avant un vrai événement payant frauduleux.
 *
 * Ne compte aussi que les versements postérieurs au dernier incident (annulation ou
 * signalement non rejeté) — la confiance ne monte jamais qu'en ligne droite : un incident
 * remet le compteur à zéro, et il faut reconstruire trusted_organizer_event_threshold
 * événements propres à partir de cet incident pour retrouver le palier rapide.
 */
async function countTrustedHistory(organizerId: string): Promise<number> {
  const resetCutoff = await getLastTrustIncident(organizerId);
  return prisma.eventPayout.count({
    where: {
      organizer_id: organizerId,
      status: "paid",
      net_amount_fcfa: { gt: 0 },
      ...(resetCutoff && { created_at: { gt: resetCutoff } }),
    },
  });
}

/**
 * Crée (si besoin) et retourne le EventPayout pour un événement terminé.
 * Idempotent — n'écrase jamais un payout existant. Ne crée rien pour un événement
 * sans aucune vente payante — il n'y a alors rien à verser, donc rien à faire suivre.
 */
export async function getOrCreateEventPayout(eventId: string) {
  const existing = await prisma.eventPayout.findUnique({ where: { event_id: eventId } });
  if (existing) return existing;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, organizer_id: true, ends_at: true, status: true },
  });
  if (!event || event.status !== "approved" || event.ends_at > new Date()) {
    return null; // pas encore terminé, ou événement non approuvé
  }

  const bookings = await prisma.eventBooking.aggregate({
    where: { event_id: eventId, status: { in: ACTIVE_BOOKING_STATUSES } },
    _sum: { subtotal_fcfa: true, discount_fcfa: true, commission_fcfa: true },
  });

  const grossFcfa = (bookings._sum.subtotal_fcfa ?? 0) - (bookings._sum.discount_fcfa ?? 0);
  const commissionFcfa = bookings._sum.commission_fcfa ?? 0;
  const netFcfa = grossFcfa - commissionFcfa;

  if (netFcfa <= 0) {
    return null; // événement gratuit ou sans vente — aucun versement à effectuer
  }

  const settings = await getPlatformSettings();
  const trustedHistoryCount = await countTrustedHistory(event.organizer_id);
  const isTrusted = trustedHistoryCount >= settings.trusted_organizer_event_threshold;
  const delayDays = isTrusted ? settings.payout_delay_trusted_organizer_days : settings.payout_delay_new_organizer_days;

  const eligibleAt = new Date(event.ends_at);
  eligibleAt.setDate(eligibleAt.getDate() + delayDays);

  return prisma.eventPayout.create({
    data: {
      event_id: eventId,
      organizer_id: event.organizer_id,
      gross_amount_fcfa: grossFcfa,
      commission_fcfa: commissionFcfa,
      net_amount_fcfa: netFcfa,
      status: eligibleAt <= new Date() ? "eligible" : "held",
      eligible_at: eligibleAt,
    },
  });
}

/** Balaye les événements terminés sans payout et les crée — appelé avant de lister la file admin. */
export async function syncPendingPayouts(): Promise<void> {
  const endedWithoutPayout = await prisma.event.findMany({
    where: { status: "approved", ends_at: { lt: new Date() }, payout: null },
    select: { id: true },
    take: 100,
  });
  for (const event of endedWithoutPayout) {
    await getOrCreateEventPayout(event.id);
  }

  // Fait passer "held" → "eligible" pour les payouts dont le délai est écoulé
  await prisma.eventPayout.updateMany({
    where: { status: "held", eligible_at: { lte: new Date() } },
    data: { status: "eligible" },
  });
}
