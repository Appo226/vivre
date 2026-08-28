/**
 * POST /api/events/bookings/[id]/report-issue — L'acheteur signale que l'événement ne
 * s'est pas déroulé comme prévu (ex : n'a pas eu lieu, sans annonce officielle de VIVRE).
 *
 * Fenêtre de signalement : 24h (T+1) après l'heure de fin prévue de l'événement — voir la
 * clause correspondante dans les Conditions d'utilisation (/terms). Passé ce délai, plus
 * de demande possible. Choisi pour laisser un jour plein de marge avant que le versement
 * organisateur "de confiance" ne devienne éligible à T+2 (voir lib/event-payout.ts) — le
 * signalement doit toujours se refermer avant que l'argent ne puisse bouger.
 *
 * Si l'événement a déjà été annulé explicitement via /api/events/[id]/cancel, le
 * remboursement a déjà été créé automatiquement — inutile de signaler à nouveau.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const REPORT_WINDOW_HOURS = 24;

const ReportIssueSchema = z.object({ reason: z.string().min(10).max(1000) });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = ReportIssueSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Décrivez le problème rencontré (min. 10 caractères)");
  }

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true, user_id: true, status: true, total_amount: true, payment_id: true,
      event: { select: { status: true, ends_at: true } },
    },
  });
  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Réservation introuvable");
  }
  if (booking.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (booking.status !== "confirmed") {
    return apiError(409, "NOT_ELIGIBLE", `Billet en statut "${booking.status}" — rien à signaler`);
  }
  if (booking.event.status === "cancelled") {
    return apiError(409, "ALREADY_HANDLED", "Cet événement a déjà été annulé — votre remboursement est déjà en cours de traitement");
  }
  if (booking.total_amount <= 0 || !booking.payment_id) {
    return apiError(409, "NO_PAYMENT_TO_REFUND", "Ce billet était gratuit — aucun remboursement applicable");
  }

  const reportDeadline = new Date(booking.event.ends_at);
  reportDeadline.setHours(reportDeadline.getHours() + REPORT_WINDOW_HOURS);
  if (new Date() < booking.event.ends_at) {
    return apiError(409, "EVENT_NOT_OVER", "L'événement n'est pas encore terminé");
  }
  if (new Date() > reportDeadline) {
    return apiError(
      409,
      "REPORT_WINDOW_EXPIRED",
      `Le délai de signalement (${REPORT_WINDOW_HOURS}h après la fin de l'événement) est dépassé`
    );
  }

  const existing = await prisma.refund.findFirst({
    where: { booking_type: "event", booking_id: booking.id, status: { not: "rejected" } },
  });
  if (existing) {
    return apiError(409, "ALREADY_REPORTED", "Un signalement est déjà en cours de traitement pour ce billet");
  }

  const refund = await prisma.refund.create({
    data: {
      payment_id: booking.payment_id,
      amount: booking.total_amount,
      reason: parsed.data.reason,
      status: "pending",
      refund_method: "mobile_money",
      booking_type: "event",
      booking_id: booking.id,
    },
    select: { id: true },
  });

  return NextResponse.json({
    message: "Signalement reçu. Notre équipe examine votre demande de remboursement.",
    refund_id: refund.id,
  });
}
