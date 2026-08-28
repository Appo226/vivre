/**
 * DELETE /api/events/[id]/staff/[staffId] — Révoquer un accès scan (organisateur ou admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; staffId: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { organizer_id: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé à l'organisateur de l'événement");
  }

  const staff = await prisma.eventStaff.findUnique({
    where: { id: params.staffId },
    select: { event_id: true },
  });
  if (!staff || staff.event_id !== params.id) {
    return apiError(404, "STAFF_NOT_FOUND", "Accès staff introuvable");
  }

  await prisma.eventStaff.update({
    where: { id: params.staffId },
    data: { revoked_at: new Date() },
  });

  return NextResponse.json({ message: "Accès scan révoqué" });
}
