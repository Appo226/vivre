/**
 * DELETE /api/events/tickets/[id] — Annuler UN billet précis (pas toute la commande).
 *
 * Réservé aux admins (voir le contrôle de rôle ci-dessous) — l'annulation en libre-service par
 * le détenteur lui-même a été retirée : plus de bouton côté acheteur, et l'API le refuse
 * maintenant même en appel direct (pas seulement caché côté UI, qui n'aurait été qu'une
 * fausse sécurité). Un litige/remboursement passe désormais par le support → un admin, pas
 * par le détenteur qui annule lui-même.
 *
 * Politique de remboursement (toujours appliquée quand un admin annule) : annulé dans l'heure
 * suivant l'émission du billet → remboursement automatique (mis en file pour traitement admin,
 * voir /admin/remboursements) ; passé ce délai, l'annulation reste possible mais sans
 * remboursement. Voir isWithinRefundWindow dans lib/events.ts pour le détail de cette fenêtre.
 *
 * La commande (EventBooking) repasse à "cancelled" seulement si ce billet était le dernier
 * encore actif — les autres billets de la même commande ne sont jamais affectés.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { cancelTickets } from "@/lib/events";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const ticket = await prisma.eventTicket.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      booking_id: true,
      user_id: true,
      status: true,
      created_at: true,
      price_fcfa_at_purchase: true,
      booking: { select: { payment_id: true } },
      event: { select: { starts_at: true } },
    },
  });
  if (!ticket) {
    return apiError(404, "TICKET_NOT_FOUND", "Billet introuvable");
  }
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Seul le support VIVRE peut annuler un billet — contactez-nous si besoin");
  }
  if (ticket.status === "cancelled") {
    return apiError(409, "ALREADY_CANCELLED", "Billet déjà annulé");
  }
  if (ticket.status === "checked_in") {
    return apiError(409, "ALREADY_CHECKED_IN", "Billet déjà utilisé — impossible d'annuler");
  }
  if (new Date(ticket.event.starts_at) <= new Date()) {
    return apiError(409, "EVENT_STARTED", "L'événement a déjà commencé — impossible d'annuler");
  }

  const { refundedFcfa, cancelledTicketIds } = await cancelTickets({
    bookingId: ticket.booking_id,
    ticketIds: [ticket.id],
    paymentId: ticket.booking.payment_id,
  });

  // Le contrôle de statut ci-dessus a pu lire un état déjà périmé (une requête concurrente —
  // double-clic, deux onglets — a pu annuler ce billet entre cette lecture et l'écriture
  // atomique dans cancelTickets). cancelledTicketIds est la SEULE source de vérité sur ce que
  // CETTE requête a réellement obtenu : sans ce contrôle, une requête qui a perdu la course
  // recevrait quand même un message "Billet annulé" — trompeur, même si aucun remboursement
  // en double n'a jamais été créé (cancelTickets s'en charge déjà côté écriture).
  if (!cancelledTicketIds.includes(ticket.id)) {
    return apiError(409, "ALREADY_CANCELLED", "Billet déjà annulé");
  }

  return NextResponse.json({
    message: refundedFcfa > 0
      ? `Billet annulé. Remboursement de ${refundedFcfa.toLocaleString("fr-FR")} FCFA mis en file de traitement.`
      : "Billet annulé. Passé le délai d'une heure après l'achat, aucun remboursement n'est applicable.",
    ticket_id: params.id,
    refunded_fcfa: refundedFcfa,
  });
}
