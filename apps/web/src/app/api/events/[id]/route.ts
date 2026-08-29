/**
 * GET /api/events/[id] — Détail d'un événement (public), lookup par id UUID ou par slug.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { looksLikeUuid, ACTIVE_BOOKING_STATUSES } from "@/lib/events";
import { requireAuth } from "@/lib/require-auth";
import { notify } from "@/lib/notifications";
import { sendOrangeSms } from "@/lib/otp-channel";

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
      rejection_reason: true,
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
          is_seated: true,
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

/**
 * PATCH /api/events/[id] — Modifier un événement déjà approuvé (organisateur ou admin).
 *
 * Volontairement limité aux champs informationnels (lieu, description, visuels...) — pas les
 * dates (voir events/[id]/reschedule, qui a sa propre logique de droit d'annulation) ni les
 * billets/prix (intégrité des réservations déjà payées, hors scope ici). Rien n'est jamais
 * "figé" sur une réservation existante pour ces champs — le GET ci-dessus (utilisé par la
 * page billet) lit l'événement en direct, jamais une copie, donc un changement ici apparaît
 * immédiatement sur tous les billets déjà émis, sans travail supplémentaire.
 *
 * Chaque acheteur ayant une réservation active reçoit une notification (in-app + SMS,
 * best-effort) — un événement relocalisé après achat est exactement le genre de changement
 * qu'un acheteur doit apprendre avant le jour J, pas en arrivant sur place.
 */
const UpdateEventSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(20).max(10000).optional(),
  venue_name: z.string().min(2).max(200).optional(),
  venue_address: z.string().min(5).max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  cover_url: z.string().url().optional(),
  gallery_urls: z.array(z.string().url()).optional(),
  safety_description: z.string().max(5000).optional(),
  expected_profile: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdateEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  if (Object.keys(parsed.data).length === 0) {
    return apiError(422, "NO_CHANGES", "Aucun champ à modifier fourni");
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { id: true, organizer_id: true, status: true, title: true, venue_name: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (!["approved", "rejected"].includes(event.status)) {
    return apiError(409, "INVALID_STATUS", `Un événement en statut "${event.status}" ne peut pas être modifié ici`);
  }

  const locationChanged =
    parsed.data.venue_name !== undefined ||
    parsed.data.venue_address !== undefined ||
    parsed.data.latitude !== undefined ||
    parsed.data.longitude !== undefined;

  // exactOptionalPropertyTypes interdit les clés explicitement `undefined` dans l'input Prisma.
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: changes,
    select: {
      id: true, title: true, description: true, venue_name: true, venue_address: true,
      latitude: true, longitude: true, cover_url: true, gallery_urls: true,
      safety_description: true, expected_profile: true,
    },
  });

  const affectedBookings = await prisma.eventBooking.findMany({
    where: { event_id: params.id, status: { in: ["pending", "confirmed"] } },
    select: { user: { select: { id: true, phone: true } } },
  });
  const uniqueBuyers = new Map(affectedBookings.map((b: (typeof affectedBookings)[number]) => [b.user.id, b.user.phone]));

  const changeSummary = locationChanged
    ? `Le lieu de "${event.title}" a changé : ${updated.venue_name}, ${updated.venue_address}.`
    : `Des informations de "${event.title}" ont été mises à jour.`;

  for (const [userId, phone] of uniqueBuyers) {
    void notify({
      userId,
      type: "event_updated",
      title: "Un événement que vous avez réservé a changé",
      body: changeSummary,
      data: { event_id: params.id },
    });
    sendOrangeSms(phone, `VIVRE : ${changeSummary}`).catch(() => {});
  }

  return NextResponse.json({
    message: uniqueBuyers.size > 0
      ? `Événement modifié. ${uniqueBuyers.size} acheteur(s) notifié(s).`
      : "Événement modifié.",
    event: updated,
  });
}
