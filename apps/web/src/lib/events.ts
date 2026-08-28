/**
 * lib/events.ts — Utilitaires partagés par les Route Handlers /api/events/*
 */

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
