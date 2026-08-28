/**
 * PATCH /api/events/[id]/cancel — Annuler un événement approuvé (organisateur ou admin).
 *
 * Action EXPLICITE — la différence avec un événement qui n'a simplement pas eu lieu sans
 * annonce est justement que VIVRE le sait ici, donc le remboursement est automatique et
 * non-litigieux : toutes les réservations actives sont annulées, et un Refund "pending"
 * est créé pour chaque billet payant déjà réglé (l'admin déclenche le virement retour).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { notify } from "@/lib/notifications";

const CancelEventSchema = z.object({ reason: z.string().min(10).max(1000) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CancelEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Un motif d'annulation (min. 10 caractères) est requis");
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { organizer_id: true, status: true, starts_at: true, title: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (event.status !== "approved") {
    return apiError(409, "INVALID_STATUS", `Un événement en statut "${event.status}" ne peut pas être annulé`);
  }
  if (event.starts_at < new Date()) {
    // Un événement déjà commencé/terminé ne peut plus être "annulé" par l'organisateur —
    // c'est exactement le cas que couvre le signalement acheteur (report-issue, fenêtre T+1).
    return apiError(409, "EVENT_ALREADY_STARTED", "Impossible d'annuler un événement déjà commencé — l'acheteur peut signaler un problème depuis son billet si besoin");
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.event.update({
      where: { id: params.id },
      data: { status: "cancelled", cancelled_at: now, cancellation_reason: parsed.data.reason },
    });

    const activeBookings = await tx.eventBooking.findMany({
      where: { event_id: params.id, status: { in: ["pending", "confirmed"] } },
      select: { id: true, total_amount: true, payment_id: true, user_id: true },
    });

    await tx.eventBooking.updateMany({
      where: { id: { in: activeBookings.map((b: (typeof activeBookings)[number]) => b.id) } },
      data: { status: "cancelled", cancelled_at: now, cancellation_reason: "Événement annulé par l'organisateur" },
    });

    let refundsCreated = 0;
    for (const booking of activeBookings) {
      if (booking.total_amount > 0 && booking.payment_id) {
        await tx.refund.create({
          data: {
            payment_id: booking.payment_id,
            amount: booking.total_amount,
            reason: "Événement annulé par l'organisateur",
            status: "pending",
            refund_method: "mobile_money",
            booking_type: "event",
            booking_id: booking.id,
          },
        });
        refundsCreated += 1;
      }
    }

    return { cancelledBookings: activeBookings.length, refundsCreated, affectedUserIds: activeBookings.map((b: (typeof activeBookings)[number]) => b.user_id) };
  });

  // Hors transaction — best-effort, ne doit jamais faire échouer l'annulation elle-même.
  for (const userId of new Set(result.affectedUserIds)) {
    void notify({
      userId,
      type: "event_cancelled",
      title: "Événement annulé",
      body: `${event.title} a été annulé. Votre remboursement est en cours de traitement.`,
      data: { event_id: params.id },
    });
  }

  return NextResponse.json({
    message: "Événement annulé. Les acheteurs concernés seront remboursés.",
    cancelledBookings: result.cancelledBookings,
    refundsCreated: result.refundsCreated,
  });
}
