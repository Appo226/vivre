/**
 * GET    /api/events/bookings/[id] — Détail d'un billet avec QR code.
 * DELETE /api/events/bookings/[id] — Annuler un billet (>24h avant l'événement, non utilisé).
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
      qr_code: true,
      checked_in_at: true,
      cancelled_at: true,
      cancellation_reason: true,
      created_at: true,
      user: { select: { first_name: true, last_name: true, phone: true } },
      ticket_type: { select: { id: true, name: true, description: true } },
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
    return apiError(404, "BOOKING_NOT_FOUND", "Billet introuvable");
  }
  if (booking.user_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  // Paiement mobile money automatique pas encore configuré : indiquer où envoyer l'argent
  // manuellement (compte de versement vérifié de l'organisateur) pour un billet en attente.
  let manualPaymentInstructions: { provider: string; phone: string; account_name: string } | null = null;
  if (booking.status === "pending" && booking.total_amount > 0 && !cinetpayConfigured()) {
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
    checked_in_at: booking.checked_in_at?.toISOString() ?? null,
    cancelled_at: booking.cancelled_at?.toISOString() ?? null,
    created_at: booking.created_at.toISOString(),
    manual_payment_instructions: manualPaymentInstructions,
    event: {
      ...booking.event,
      starts_at: booking.event.starts_at.toISOString(),
      ends_at: booking.event.ends_at.toISOString(),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true, user_id: true, status: true, created_at: true,
      event: { select: { starts_at: true, rescheduled_at: true } },
    },
  });
  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Billet introuvable");
  }
  if (booking.user_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (booking.status === "cancelled") {
    return apiError(409, "ALREADY_CANCELLED", "Billet déjà annulé");
  }
  if (booking.status === "checked_in") {
    return apiError(409, "ALREADY_CHECKED_IN", "Billet déjà utilisé — impossible d'annuler");
  }

  // L'événement a été reprogrammé APRÈS cette réservation : l'acheteur a acheté sous des
  // conditions différentes, donc le délai habituel de 24h ne s'applique pas — annulation libre.
  const rescheduledAfterBooking =
    booking.event.rescheduled_at !== null && booking.event.rescheduled_at > booking.created_at;

  if (!rescheduledAfterBooking) {
    const deadline = new Date(booking.event.starts_at);
    deadline.setHours(deadline.getHours() - 24);
    if (new Date() > deadline) {
      return apiError(409, "CANCELLATION_TOO_LATE", "Impossible d'annuler moins de 24h avant l'événement");
    }
  }

  await prisma.eventBooking.update({
    where: { id: params.id },
    data: { status: "cancelled", cancelled_at: new Date() },
  });

  return NextResponse.json({ message: "Billet annulé avec succès", booking_id: params.id });
}
