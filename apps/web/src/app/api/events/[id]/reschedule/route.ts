/**
 * PATCH /api/events/[id]/reschedule — Reprogrammer un événement approuvé (organisateur/admin).
 *
 * Ne touche pas aux réservations existantes — les billets restent valables pour la nouvelle
 * date. Mais comme les conditions ont changé après l'achat, tout acheteur ayant réservé
 * AVANT la reprogrammation obtient un droit d'annulation inconditionnel (voir la vérification
 * dans DELETE /api/events/bookings/[id]), même si on est à moins de 24h du nouveau créneau.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { notify } from "@/lib/notifications";
import { sendOrangeSms } from "@/lib/otp-channel";

const RescheduleSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  reason: z.string().min(10).max(1000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = RescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { organizer_id: true, status: true, starts_at: true, original_starts_at: true, title: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (event.status !== "approved") {
    return apiError(409, "INVALID_STATUS", `Un événement en statut "${event.status}" ne peut pas être reprogrammé`);
  }
  if (event.starts_at < new Date()) {
    return apiError(409, "EVENT_ALREADY_STARTED", "Impossible de reprogrammer un événement déjà commencé");
  }

  const newStarts = new Date(parsed.data.starts_at);
  const newEnds = new Date(parsed.data.ends_at);
  if (newStarts >= newEnds) {
    return apiError(422, "INVALID_DATES", "La date de fin doit être après la date de début");
  }
  if (newStarts < new Date()) {
    return apiError(422, "DATE_IN_PAST", "La nouvelle date de début doit être dans le futur");
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      starts_at: newStarts,
      ends_at: newEnds,
      rescheduled_at: new Date(),
      reschedule_reason: parsed.data.reason,
      // Ne fixer original_starts_at qu'une seule fois — trace le tout premier créneau annoncé
      original_starts_at: event.original_starts_at ?? event.starts_at,
    },
    select: { id: true, starts_at: true, ends_at: true, original_starts_at: true },
  });

  const affectedBookings = await prisma.eventBooking.findMany({
    where: { event_id: params.id, status: { in: ["pending", "confirmed"] } },
    select: { user: { select: { id: true, phone: true } } },
  });
  const uniqueBuyers = new Map(affectedBookings.map((b: (typeof affectedBookings)[number]) => [b.user.id, b.user.phone]));
  const newDateLabel = newStarts.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const messageBody = `${event.title} a une nouvelle date : ${newDateLabel}. Vous pouvez annuler librement si ça ne vous convient plus.`;
  for (const [userId, phone] of uniqueBuyers) {
    void notify({
      userId,
      type: "event_updated",
      title: "Événement reprogrammé",
      body: messageBody,
      data: { event_id: params.id },
    });
    sendOrangeSms(phone, `VIVRE : ${messageBody}`).catch(() => {});
  }

  return NextResponse.json({
    message: "Événement reprogrammé. Les acheteurs déjà inscrits peuvent annuler librement s'ils le souhaitent.",
    event: updated,
  });
}
