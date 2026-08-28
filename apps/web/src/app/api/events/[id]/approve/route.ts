/**
 * PATCH /api/events/[id]/approve — Approuver un événement payant (admin uniquement).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { sendEmail, eventApprovedEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const { id } = params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      title: true,
      slug: true,
      organizer: { select: { id: true, email: true } },
    },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.status !== "pending_approval") {
    return apiError(409, "INVALID_STATUS", `Impossible d'approuver un événement en statut "${event.status}"`);
  }

  await prisma.event.update({
    where: { id },
    data: { status: "approved", approved_by: auth.sub, approved_at: new Date() },
  });

  void notify({
    userId: event.organizer.id,
    type: "event_approved",
    title: "Votre événement est approuvé",
    body: `${event.title} est maintenant visible et en vente.`,
    data: { event_id: id, slug: event.slug },
  });

  void sendEmail({
    to: event.organizer.email,
    subject: `${event.title} est approuvé`,
    html: eventApprovedEmail({
      eventTitle: event.title,
      eventUrl: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/${event.slug}`,
    }),
  });

  return NextResponse.json({ message: "Événement approuvé", event_id: id });
}
