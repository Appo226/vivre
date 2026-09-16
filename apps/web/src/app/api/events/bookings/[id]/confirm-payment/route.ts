/**
 * PATCH /api/events/bookings/[id]/confirm-payment — Confirmation manuelle de paiement.
 *
 * Pont pour le lancement avant CinetPay : l'acheteur envoie le mobile money directement
 * au compte vérifié de l'organisateur (payout_phone / payout_provider), l'organisateur ou
 * un admin confirme ici avoir reçu la somme. Émet le même billet + QR code que le flux
 * automatique — seule la façon dont l'argent circule diffère. Passe par
 * lib/payments/orchestrator.ts (confirmManualPayment) — c'est aujourd'hui le SEUL chemin de
 * paiement réellement utilisé en production.
 *
 * N'a de sens que pendant la phase pilote (free_period_enabled=true) : sans agrégateur,
 * VIVRE n'a aucun moyen automatique de prélever sa commission sur un paiement manuel.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { issueTicketsForBooking } from "@/lib/events";
import { confirmManualPayment } from "@/lib/payments/orchestrator";

const ConfirmPaymentSchema = z.object({ reference_note: z.string().min(3).max(300) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = ConfirmPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "reference_note requis (ex: référence de la transaction mobile money)");
  }

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true, total_amount: true, commission_fcfa: true, user_id: true,
      payment_id: true,
      event: { select: { organizer_id: true } },
    },
  });
  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Réservation introuvable");
  }

  const isAdmin = auth.roles.includes("admin");
  const isOrganizer = booking.event.organizer_id === auth.sub;
  if (!isAdmin && !isOrganizer) {
    return apiError(403, "AUTH_FORBIDDEN", "Seul l'organisateur de l'événement ou un admin peut confirmer ce paiement");
  }
  if (booking.status !== "pending") {
    return apiError(409, "NOT_PAYABLE", `Réservation en statut "${booking.status}" — rien à confirmer`);
  }
  if (booking.total_amount <= 0) {
    return apiError(409, "ALREADY_FREE", "Ce billet est gratuit — aucune confirmation de paiement nécessaire");
  }

  await confirmManualPayment({
    userId: booking.user_id,
    bookingType: "event",
    bookingId: booking.id,
    existingPaymentId: booking.payment_id,
    amountFcfa: booking.total_amount,
    platformFeeFcfa: booking.commission_fcfa,
    supplierAmountFcfa: booking.total_amount - booking.commission_fcfa,
    referenceNote: parsed.data.reference_note,
    confirmedByUserId: auth.sub,
  });

  // confirmManualPayment() a déjà appelé issueTicketsForBooking() via applyCompletedPayment()
  // — rappel ici volontairement redondant-mais-sûr (idempotent, voir lib/events.ts) pour
  // rester explicite dans cette route sur ce qui émet le billet.
  await issueTicketsForBooking(booking.id);

  return NextResponse.json({ message: "Paiement confirmé manuellement. Billet émis.", booking_id: booking.id, status: "confirmed" });
}
