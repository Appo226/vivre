/**
 * POST /api/events/bookings/[id]/scan — Valider un billet à l'entrée (check-in).
 * Réservé à l'organisateur de l'événement ou à un admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

function invalid(status: number, error: string, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ valid: false, error, code, ...extra }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      quantity: true,
      checked_in_at: true,
      ticket_type: { select: { name: true } },
      event: { select: { id: true, title: true, organizer_id: true, starts_at: true, ends_at: true } },
      user: { select: { first_name: true, last_name: true, phone: true } },
    },
  });

  if (!booking) {
    return invalid(404, "Billet introuvable", "BOOKING_NOT_FOUND");
  }

  const isAdmin = auth.roles.includes("admin");
  const isOrganizer = booking.event.organizer_id === auth.sub;
  let isStaff = false;
  if (!isAdmin && !isOrganizer) {
    const staffAccess = await prisma.eventStaff.findFirst({
      where: { event_id: booking.event.id, phone: auth.phone, revoked_at: null },
      select: { id: true },
    });
    isStaff = Boolean(staffAccess);
  }
  if (!isAdmin && !isOrganizer && !isStaff) {
    return invalid(403, "Seuls l'organisateur, son staff autorisé ou un admin peuvent scanner les billets", "AUTH_FORBIDDEN");
  }

  const now = new Date();
  const twoHoursBefore = new Date(booking.event.starts_at);
  twoHoursBefore.setHours(twoHoursBefore.getHours() - 2);

  if (now < twoHoursBefore) {
    return invalid(409, "L'événement n'a pas encore commencé (scan possible 2h avant)", "EVENT_NOT_STARTED");
  }
  if (now > new Date(booking.event.ends_at)) {
    return invalid(409, "L'événement est terminé", "EVENT_ENDED");
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ valid: false, error: "Billet annulé", code: "BOOKING_CANCELLED" });
  }
  if (booking.status === "checked_in") {
    return NextResponse.json({
      valid: false,
      error: "Billet déjà scanné",
      code: "ALREADY_CHECKED_IN",
      checked_in_at: booking.checked_in_at?.toISOString(),
    });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json({
      valid: false,
      error: `Billet non confirmé (statut: ${booking.status})`,
      code: "BOOKING_NOT_CONFIRMED",
    });
  }

  await prisma.eventBooking.update({
    where: { id: params.id },
    data: { status: "checked_in", checked_in_at: now },
  });

  return NextResponse.json({
    valid: true,
    booking_id: params.id,
    event_title: booking.event.title,
    ticket_type: booking.ticket_type.name,
    quantity: booking.quantity,
    holder: {
      name: [booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || "N/A",
      phone: booking.user.phone,
    },
    checked_in_at: now.toISOString(),
  });
}
