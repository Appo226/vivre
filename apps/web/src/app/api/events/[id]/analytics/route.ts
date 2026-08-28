/**
 * GET /api/events/[id]/analytics — Tableau de bord analytics d'un événement (organisateur/admin).
 *
 * Couvre le strict nécessaire pour qu'un organisateur comprenne comment son événement se
 * vend, sans dépendance externe (aucun outil d'analytics tiers) : revenus, ventes par type
 * de billet, taux de remplissage, taux de présence, ventes dans le temps, et le funnel
 * vues → réservations (view_count est incrémenté à chaque consultation publique de la page).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/events";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: {
      organizer_id: true,
      view_count: true,
      max_capacity: true,
      commission_percent: true,
      ticket_types: { select: { id: true, name: true, price_fcfa: true, quantity: true } },
    },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  const bookings = await prisma.eventBooking.findMany({
    where: { event_id: params.id, status: { in: ACTIVE_BOOKING_STATUSES } },
    select: {
      quantity: true,
      subtotal_fcfa: true,
      discount_fcfa: true,
      commission_fcfa: true,
      status: true,
      created_at: true,
      ticket_type_id: true,
    },
  });

  const cancelledCount = await prisma.eventBooking.count({
    where: { event_id: params.id, status: "cancelled" },
  });

  const checkedInTicketsCount = await prisma.eventTicket.count({
    where: { event_id: params.id, status: "checked_in" },
  });

  type AnalyticsBooking = (typeof bookings)[number];
  type AnalyticsTicketType = (typeof event.ticket_types)[number];

  const grossRevenue = bookings.reduce((sum: number, b: AnalyticsBooking) => sum + (b.subtotal_fcfa - b.discount_fcfa), 0);
  const totalCommission = bookings.reduce((sum: number, b: AnalyticsBooking) => sum + b.commission_fcfa, 0);
  const ticketsSold = bookings.reduce((sum: number, b: AnalyticsBooking) => sum + b.quantity, 0);
  const checkedIn = checkedInTicketsCount;

  const salesByTicketType = event.ticket_types.map((tt: AnalyticsTicketType) => {
    const ttBookings = bookings.filter((b: AnalyticsBooking) => b.ticket_type_id === tt.id);
    const sold = ttBookings.reduce((sum: number, b: AnalyticsBooking) => sum + b.quantity, 0);
    return {
      ticket_type_id: tt.id,
      name: tt.name,
      price_fcfa: tt.price_fcfa,
      capacity: tt.quantity,
      sold,
      revenue_fcfa: ttBookings.reduce((sum: number, b: AnalyticsBooking) => sum + (b.subtotal_fcfa - b.discount_fcfa), 0),
    };
  });

  // Ventes par jour — pour un graphique simple côté organisateur
  const salesByDay = new Map<string, { bookings: number; tickets: number; revenue_fcfa: number }>();
  for (const b of bookings) {
    const day = b.created_at.toISOString().slice(0, 10);
    const entry = salesByDay.get(day) ?? { bookings: 0, tickets: 0, revenue_fcfa: 0 };
    entry.bookings += 1;
    entry.tickets += b.quantity;
    entry.revenue_fcfa += b.subtotal_fcfa - b.discount_fcfa;
    salesByDay.set(day, entry);
  }

  const totalCapacity = event.ticket_types.reduce((sum: number, tt: AnalyticsTicketType) => sum + tt.quantity, 0);

  return NextResponse.json({
    views: event.view_count,
    bookings_count: bookings.length,
    tickets_sold: ticketsSold,
    tickets_cancelled: cancelledCount,
    total_capacity: totalCapacity,
    sold_percent: totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0,
    checked_in: checkedIn,
    checked_in_percent: ticketsSold > 0 ? Math.round((checkedIn / ticketsSold) * 100) : 0,
    // Conversion vue → réservation — un signal simple sur l'efficacité de la page événement
    view_to_booking_percent: event.view_count > 0 ? Math.round((bookings.length / event.view_count) * 1000) / 10 : 0,
    gross_revenue_fcfa: grossRevenue,
    commission_fcfa: totalCommission,
    net_revenue_fcfa: grossRevenue - totalCommission,
    sales_by_ticket_type: salesByTicketType,
    sales_by_day: Array.from(salesByDay.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}
