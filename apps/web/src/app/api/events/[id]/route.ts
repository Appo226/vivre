/**
 * GET /api/events/[id] — Détail d'un événement (public), lookup par id UUID ou par slug.
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { looksLikeUuid, ACTIVE_BOOKING_STATUSES } from "@/lib/events";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;
  const where = looksLikeUuid(id) ? { id } : { slug: id };

  const event = await prisma.event.findFirst({
    where: { ...where, deleted_at: null },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      cover_url: true,
      gallery_urls: true,
      venue_name: true,
      venue_address: true,
      latitude: true,
      longitude: true,
      starts_at: true,
      ends_at: true,
      max_capacity: true,
      status: true,
      is_featured: true,
      safety_description: true,
      city: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, icon: true, color_hex: true } },
      category_tags: { select: { category: { select: { id: true, name: true, icon: true } } } },
      organizer: { select: { id: true, first_name: true, last_name: true } },
      ticket_types: {
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          description: true,
          price_fcfa: true,
          quantity: true,
          max_per_order: true,
          included_items: true,
          variant_options: true,
          sale_starts_at: true,
          sale_ends_at: true,
        },
        orderBy: { price_fcfa: "asc" },
      },
      merch_items: {
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          description: true,
          price_fcfa: true,
          quantity: true,
          variant_options: true,
        },
        orderBy: { price_fcfa: "asc" },
      },
      _count: { select: { bookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } } } },
    },
  });

  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }

  // Suivi léger pour les analytics organisateur — pas besoin d'attendre l'écriture.
  void prisma.event.update({ where: { id: event.id }, data: { view_count: { increment: 1 } } }).catch(() => {});

  const ticketTypesWithAvailability = await Promise.all(
    event.ticket_types.map(async (tt: (typeof event.ticket_types)[number]) => {
      const sold = await prisma.eventBooking.aggregate({
        where: { ticket_type_id: tt.id, status: { in: ACTIVE_BOOKING_STATUSES } },
        _sum: { quantity: true },
      });
      const soldCount = sold._sum.quantity ?? 0;
      return {
        ...tt,
        available: Math.max(0, tt.quantity - soldCount),
        sale_starts_at: tt.sale_starts_at?.toISOString() ?? null,
        sale_ends_at: tt.sale_ends_at?.toISOString() ?? null,
      };
    })
  );

  const merchItemsWithAvailability = await Promise.all(
    event.merch_items.map(async (m: (typeof event.merch_items)[number]) => {
      const sold = await prisma.eventBookingMerchItem.aggregate({
        where: { merch_item_id: m.id, booking: { status: { in: ACTIVE_BOOKING_STATUSES } } },
        _sum: { quantity: true },
      });
      const soldCount = sold._sum.quantity ?? 0;
      return { ...m, available: Math.max(0, m.quantity - soldCount) };
    })
  );

  return NextResponse.json({
    ...event,
    starts_at: event.starts_at.toISOString(),
    ends_at: event.ends_at.toISOString(),
    ticket_types: ticketTypesWithAvailability,
    merch_items: merchItemsWithAvailability,
    total_bookings: event._count.bookings,
  });
}
