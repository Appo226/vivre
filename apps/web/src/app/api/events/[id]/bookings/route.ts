/**
 * GET /api/events/[id]/bookings — Réservations d'un événement (organisateur ou admin).
 * Utilisé par le dashboard organisateur pour voir et confirmer les paiements manuels en attente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  const bookings = await prisma.eventBooking.findMany({
    where: { event_id: params.id },
    select: {
      id: true,
      quantity: true,
      total_amount: true,
      status: true,
      created_at: true,
      checked_in_at: true,
      ticket_type: { select: { name: true } },
      user: { select: { first_name: true, last_name: true, phone: true } },
      payment: { select: { payment_method: true, provider_ref: true } },
    },
    orderBy: { created_at: "desc" },
  });

  type EventBookingRow = (typeof bookings)[number];
  return NextResponse.json({
    bookings: bookings.map((b: EventBookingRow) => ({
      ...b,
      created_at: b.created_at.toISOString(),
      checked_in_at: b.checked_in_at?.toISOString() ?? null,
    })),
  });
}
