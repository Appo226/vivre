/**
 * POST /api/events/tickets/[id]/scan — Valider UN billet individuel à l'entrée (check-in).
 * Réservé à l'organisateur de l'événement, son staff autorisé, ou un admin.
 *
 * `params.id` est normalement l'id d'un EventTicket (nouveau format de QR, un billet =
 * un QR). Repli legacy : si aucun EventTicket ne correspond, on essaie de traiter l'id comme
 * un EventBooking (ancien format de QR, avant l'introduction des billets individuels — voir
 * migration 20260828185127_event_tickets) et on scanne son premier billet encore valide. Ça
 * garde scannables les quelques billets déjà émis/téléchargés avant ce déploiement.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

function invalid(status: number, error: string, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ valid: false, error, code, ...extra }, { status });
}

const TICKET_SELECT = {
  id: true,
  status: true,
  checked_in_at: true,
  ticket_number: true,
  booking: { select: { quantity: true, ticket_type: { select: { name: true } } } },
  event: { select: { id: true, title: true, organizer_id: true, starts_at: true, ends_at: true } },
  user: { select: { first_name: true, last_name: true, phone: true } },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let ticket = await prisma.eventTicket.findUnique({ where: { id: params.id }, select: TICKET_SELECT });

  if (!ticket) {
    // Repli legacy — voir le commentaire d'en-tête.
    ticket = await prisma.eventTicket.findFirst({
      where: { booking_id: params.id, status: "valid" },
      orderBy: { ticket_number: "asc" },
      select: TICKET_SELECT,
    });
  }

  if (!ticket) {
    return invalid(404, "Billet introuvable", "TICKET_NOT_FOUND");
  }

  const isAdmin = auth.roles.includes("admin");
  const isOrganizer = ticket.event.organizer_id === auth.sub;
  let isStaff = false;
  if (!isAdmin && !isOrganizer) {
    const staffAccess = await prisma.eventStaff.findFirst({
      where: { event_id: ticket.event.id, phone: auth.phone, revoked_at: null },
      select: { id: true },
    });
    isStaff = Boolean(staffAccess);
  }
  if (!isAdmin && !isOrganizer && !isStaff) {
    return invalid(403, "Seuls l'organisateur, son staff autorisé ou un admin peuvent scanner les billets", "AUTH_FORBIDDEN");
  }

  const now = new Date();
  const twoHoursBefore = new Date(ticket.event.starts_at);
  twoHoursBefore.setHours(twoHoursBefore.getHours() - 2);

  if (now < twoHoursBefore) {
    return invalid(409, "L'événement n'a pas encore commencé (scan possible 2h avant)", "EVENT_NOT_STARTED");
  }
  if (now > new Date(ticket.event.ends_at)) {
    return invalid(409, "L'événement est terminé", "EVENT_ENDED");
  }
  if (ticket.status === "cancelled") {
    return invalid(409, "Billet annulé", "TICKET_CANCELLED");
  }
  if (ticket.status === "checked_in") {
    return invalid(409, "Billet déjà scanné", "ALREADY_CHECKED_IN", {
      checked_in_at: ticket.checked_in_at?.toISOString(),
    });
  }

  await prisma.eventTicket.update({
    where: { id: ticket.id },
    data: { status: "checked_in", checked_in_at: now },
  });

  return NextResponse.json({
    valid: true,
    ticket_id: ticket.id,
    event_title: ticket.event.title,
    ticket_type: ticket.booking.ticket_type.name,
    ticket_number: ticket.ticket_number,
    ticket_count: ticket.booking.quantity,
    holder: {
      name: [ticket.user.first_name, ticket.user.last_name].filter(Boolean).join(" ") || "N/A",
      phone: ticket.user.phone,
    },
    checked_in_at: now.toISOString(),
  });
}
