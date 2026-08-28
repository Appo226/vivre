/**
 * lib/events.ts — Utilitaires partagés par les Route Handlers /api/events/*
 */

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

/** Encode les données d'un billet dans le QR code (base64 JSON). */
export function generateEventQr(
  bookingId: string,
  eventId: string,
  userId: string,
  ticketTypeName: string,
  quantity: number
): string {
  const data = { b: bookingId, e: eventId, u: userId, t: ticketTypeName, q: quantity };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/** true si l'id ressemble à un UUID (sinon on le traite comme un slug). */
export function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "checked_in"];
export { ACTIVE_BOOKING_STATUSES };
