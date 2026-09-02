/**
 * GET /api/transfers/[token] — Aperçu public d'un transfert de billet (lien magique SMS).
 *
 * Pas d'authentification requise : c'est justement le point du lien envoyé par SMS, il doit
 * fonctionner pour quelqu'un qui n'a pas encore de session VIVRE. Le token (UUID) est la
 * seule protection contre la devinette — comme un lien de réinitialisation de mot de passe.
 * Ne renvoie que ce qu'il faut pour afficher "X vous a transféré un billet pour Y" avant
 * connexion ; jamais le QR ni les détails complets du billet (ça, c'est après connexion,
 * sur /evenements/mes-billets/[id], protégé par l'auth normale).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
): Promise<NextResponse> {
  const transfer = await prisma.ticketTransfer.findUnique({
    where: { token: params.token },
    select: {
      recipient_phone: true,
      ticket_id: true,
      sender: { select: { first_name: true, last_name: true } },
      ticket: {
        select: {
          booking_id: true,
          booking: {
            select: {
              event: { select: { title: true, cover_url: true, starts_at: true, venue_name: true } },
            },
          },
        },
      },
    },
  });
  if (!transfer) {
    return apiError(404, "TRANSFER_NOT_FOUND", "Ce lien de transfert n'existe pas ou n'est plus valide");
  }

  const senderName = [transfer.sender.first_name, transfer.sender.last_name].filter(Boolean).join(" ") || null;

  return NextResponse.json({
    ticket_id: transfer.ticket_id,
    // /evenements/mes-billets/[id] est keyé par commande (EventBooking), pas par billet —
    // une commande transférée en partie garde le même id, chaque détenteur n'y voit que ce
    // qu'il détient (voir GET /api/events/bookings/[id]). Rediriger avec ticket_id renvoyait
    // "Billet introuvable".
    booking_id: transfer.ticket.booking_id,
    recipient_phone: transfer.recipient_phone,
    sender_name: senderName,
    event: {
      title: transfer.ticket.booking.event.title,
      cover_url: transfer.ticket.booking.event.cover_url,
      starts_at: transfer.ticket.booking.event.starts_at.toISOString(),
      venue_name: transfer.ticket.booking.event.venue_name,
    },
  });
}
