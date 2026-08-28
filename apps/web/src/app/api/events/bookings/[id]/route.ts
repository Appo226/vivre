/**
 * GET /api/events/bookings/[id] — Détail d'une commande : infos événement/paiement + les
 * billets individuels que L'APPELANT détient actuellement dans cette commande.
 *
 * Une commande peut avoir plusieurs détenteurs après transfert (voir
 * /api/events/tickets/[id]/transfer, qui opère par billet) : l'acheteur d'origine qui a cédé
 * 1 des 4 billets achetés ne détient plus que 3 billets de SA propre commande, tandis que le
 * destinataire du transfert accède à cette même commande pour voir SON billet — chacun ne
 * voit que ce qu'il détient réellement (`tickets` est filtré par détenteur, jamais la commande
 * entière telle qu'achetée à l'origine).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { cinetpayConfigured } from "@/lib/cinetpay";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      user_id: true,
      quantity: true,
      unit_price_fcfa: true,
      total_amount: true,
      commission_fcfa: true,
      status: true,
      created_at: true,
      user: { select: { first_name: true, last_name: true, phone: true } },
      ticket_type: { select: { id: true, name: true, description: true } },
      tickets: {
        where: { user_id: auth.sub },
        orderBy: { ticket_number: "asc" },
        select: {
          id: true,
          ticket_number: true,
          status: true,
          qr_code: true,
          checked_in_at: true,
          cancelled_at: true,
          created_at: true,
          price_fcfa_at_purchase: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          cover_url: true,
          venue_name: true,
          venue_address: true,
          starts_at: true,
          ends_at: true,
          latitude: true,
          longitude: true,
          city: { select: { name: true } },
          organizer: { select: { id: true, first_name: true, last_name: true, phone: true } },
        },
      },
    },
  });

  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Réservation introuvable");
  }

  const isAdmin = auth.roles.includes("admin");
  const isOriginalBuyer = booking.user_id === auth.sub;
  const holdsAnyTicket = booking.tickets.length > 0;
  if (!isAdmin && !isOriginalBuyer && !holdsAnyTicket) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  // Paiement mobile money automatique pas encore configuré : indiquer où envoyer l'argent
  // manuellement (compte de versement vérifié de l'organisateur) pour un billet en attente.
  // N'a de sens que pour l'acheteur d'origine — un billet transféré est toujours déjà payé.
  let manualPaymentInstructions: { provider: string; phone: string; account_name: string } | null = null;
  if (isOriginalBuyer && booking.status === "pending" && booking.total_amount > 0 && !cinetpayConfigured()) {
    const verification = await prisma.organizerVerification.findUnique({
      where: { user_id: booking.event.organizer.id },
      select: { payout_provider: true, payout_phone: true, payout_account_name: true },
    });
    if (verification?.payout_provider && verification.payout_phone && verification.payout_account_name) {
      manualPaymentInstructions = {
        provider: verification.payout_provider,
        phone: verification.payout_phone,
        account_name: verification.payout_account_name,
      };
    }
  }

  return NextResponse.json({
    ...booking,
    created_at: booking.created_at.toISOString(),
    is_original_buyer: isOriginalBuyer,
    tickets: booking.tickets.map((t) => ({
      ...t,
      checked_in_at: t.checked_in_at?.toISOString() ?? null,
      cancelled_at: t.cancelled_at?.toISOString() ?? null,
      created_at: t.created_at.toISOString(),
    })),
    manual_payment_instructions: manualPaymentInstructions,
    event: {
      ...booking.event,
      starts_at: booking.event.starts_at.toISOString(),
      ends_at: booking.event.ends_at.toISOString(),
    },
  });
}
