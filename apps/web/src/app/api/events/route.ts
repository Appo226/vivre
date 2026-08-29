/**
 * GET  /api/events — Découverte d'événements (public)
 * POST /api/events — Créer un événement en brouillon (organisateur, auth requise)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { generateEventSlug, ACTIVE_BOOKING_STATUSES } from "@/lib/events";
import { EventsQuerySchema, CreateEventSchema } from "@/lib/schemas/events";
import { getPlatformSettings, effectiveOrganizerFeePercent } from "@/lib/platform-settings";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = EventsQuerySchema.safeParse(query);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Paramètres invalides");
  }
  const { city_id, category_id, q, from_date, featured, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const fromDateFilter = from_date ? new Date(from_date) : new Date();

  // Un événement est visible dès qu'il est "approved" — plus de frais de publication requis
  // (les événements 100% gratuits s'auto-approuvent, voir PATCH /api/events/[id]/submit).
  const where = {
    status: "approved",
    deleted_at: null,
    starts_at: { gte: fromDateFilter },
    ...(city_id && { city_id }),
    ...(featured === "true" && { is_featured: true }),
    // AND (pas des clés OR séparées) : category_id et q peuvent être actifs en même temps,
    // et deux clés "OR" au même niveau d'un objet JS s'écraseraient silencieusement.
    AND: [
      // Une catégorie peut matcher soit la catégorie primaire, soit un tag additionnel —
      // cliquer sur "Religieux" doit remonter un événement tagué Religieux même si sa
      // catégorie primaire (badge affiché) est "Concert".
      ...(category_id
        ? [{ OR: [{ category_id }, { category_tags: { some: { category_id } } }] }]
        : []),
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { venue_name: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        cover_url: true,
        starts_at: true,
        ends_at: true,
        venue_name: true,
        is_featured: true,
        city: { select: { name: true } },
        category: { select: { name: true, icon: true, color_hex: true } },
        ticket_types: {
          where: { is_active: true },
          select: { price_fcfa: true },
          orderBy: { price_fcfa: "asc" },
          take: 1,
        },
        _count: { select: { bookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } } } },
      },
      orderBy: [{ is_featured: "desc" }, { starts_at: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.event.count({ where }),
  ]);

  type EventListItem = (typeof events)[number];
  return NextResponse.json({
    events: events.map((e: EventListItem) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      cover_url: e.cover_url,
      starts_at: e.starts_at.toISOString(),
      ends_at: e.ends_at.toISOString(),
      venue_name: e.venue_name,
      is_featured: e.is_featured,
      city: e.city,
      category: e.category,
      min_price: e.ticket_types[0]?.price_fcfa ?? 0,
      bookings_count: e._count.bookings,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const data = parsed.data;

  const startsAt = new Date(data.starts_at);
  const endsAt = new Date(data.ends_at);
  if (startsAt >= endsAt) {
    return apiError(422, "INVALID_DATES", "La date de fin doit être après la date de début");
  }
  if (startsAt < new Date()) {
    return apiError(422, "DATE_IN_PAST", "La date de début doit être dans le futur");
  }

  const slug = generateEventSlug(data.title, data.starts_at);
  const [settings, organizer] = await Promise.all([
    getPlatformSettings(),
    prisma.user.findUnique({ where: { id: auth.sub }, select: { fee_discount_percent: true } }),
  ]);

  const event = await prisma.event.create({
    data: {
      organizer_id: auth.sub,
      city_id: data.city_id,
      category_id: data.category_id,
      title: data.title,
      slug,
      description: data.description,
      cover_url: data.cover_url ?? null,
      gallery_urls: data.gallery_urls,
      venue_name: data.venue_name,
      venue_address: data.venue_address,
      latitude: data.latitude,
      longitude: data.longitude,
      starts_at: startsAt,
      ends_at: endsAt,
      max_capacity: data.max_capacity,
      safety_description: data.safety_description ?? null,
      expected_profile: data.expected_profile ?? null,
      // Frais figés au moment de la création — un changement de réglage plus tard
      // n'affecte pas les événements déjà créés, seulement les nouveaux.
      commission_percent: effectiveOrganizerFeePercent(settings, organizer?.fee_discount_percent ?? 0),
      status: "draft",
      ticket_types: {
        create: data.ticket_types.map((tt: (typeof data.ticket_types)[number]) => ({
          name: tt.name,
          description: tt.description ?? null,
          price_fcfa: tt.price_fcfa,
          quantity: tt.quantity,
          max_per_order: tt.max_per_order,
          included_items: tt.included_items,
          variant_options: tt.variant_options,
          ...(tt.sale_starts_at && { sale_starts_at: new Date(tt.sale_starts_at) }),
          ...(tt.sale_ends_at && { sale_ends_at: new Date(tt.sale_ends_at) }),
        })),
      },
      // On exclut category_id du set de tags — la primaire est déjà couverte par le champ
      // ci-dessus, un doublon dans category_tags n'apporte rien.
      category_tags: {
        create: data.additional_category_ids
          .filter((categoryId: string) => categoryId !== data.category_id)
          .map((categoryId: string) => ({ category_id: categoryId })),
      },
      merch_items: {
        create: data.merch_items.map((m: (typeof data.merch_items)[number]) => ({
          name: m.name,
          description: m.description ?? null,
          price_fcfa: m.price_fcfa,
          quantity: m.quantity,
          variant_options: m.variant_options,
        })),
      },
    },
    select: { id: true, title: true, slug: true, status: true },
  });

  // Créer un événement ne demandait jusqu'ici aucun rôle préalable (n'importe quel compte
  // connecté peut organiser) — mais sans ce rôle "supplier", la section "Mon espace
  // fournisseur" du profil (où vit "Mes événements", seul chemin vers le scanner) reste
  // invisible : l'organisateur ne peut jamais retrouver ses propres outils après coup. Upsert
  // pour ne jamais dupliquer si le rôle existe déjà (@@unique([user_id, role])).
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: auth.sub, role: "supplier" } },
    update: {},
    create: { user_id: auth.sub, role: "supplier", is_approved: true, approved_at: new Date() },
  });

  return NextResponse.json(
    {
      ...event,
      message: `Événement créé en brouillon. Soumettez-le via PATCH /api/events/${event.id}/submit`,
    },
    { status: 201 }
  );
}
