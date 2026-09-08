/**
 * /api/events/[id]/reviews — Avis sur un événement.
 *
 * GET  : liste publique, paginée, des avis visibles.
 * POST : créer OU modifier son propre avis (upsert sur la contrainte unique
 *        user_id+entity_type+entity_id) — un seul avis par utilisateur par événement.
 *        Réservé aux acheteurs ayant une réservation confirmée pour un événement déjà
 *        terminé (voir canReviewEvent) : on ne laisse pas noter un événement auquel on n'a
 *        pas assisté. rating_avg sur Event est recalculé ici — aucun trigger DB ne le fait
 *        (voir commentaire sur le modèle Review dans schema.prisma).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

async function canReviewEvent(userId: string, eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { ends_at: true } });
  if (!event || event.ends_at > new Date()) return false;

  const booking = await prisma.eventBooking.findFirst({
    where: { user_id: userId, event_id: eventId, status: { in: ["confirmed", "checked_in"] } },
    select: { id: true },
  });
  return booking !== null;
}

async function recomputeRatingAvg(eventId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { entity_type: "event", entity_id: eventId, is_visible: true },
    _avg: { rating: true },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: { rating_avg: agg._avg.rating ?? 0 },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { entity_type: "event", entity_id: params.id, is_visible: true },
      select: {
        id: true,
        rating: true,
        comment: true,
        is_verified: true,
        response: true,
        response_at: true,
        created_at: true,
        user: { select: { first_name: true, last_name: true, avatar_url: true } },
      },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where: { entity_type: "event", entity_id: params.id, is_visible: true } }),
  ]);

  return NextResponse.json({
    reviews: reviews.map((r: (typeof reviews)[number]) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      response_at: r.response_at?.toISOString() ?? null,
    })),
    total,
    page,
    has_more: page * limit < total,
  });
}

const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  const event = await prisma.event.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }

  const booking = await prisma.eventBooking.findFirst({
    where: { user_id: auth.sub, event_id: params.id, status: { in: ["confirmed", "checked_in"] } },
    select: { id: true },
  });
  const eligible = await canReviewEvent(auth.sub, params.id);
  if (!eligible) {
    return apiError(403, "NOT_ELIGIBLE", "Vous pourrez laisser un avis une fois l'événement terminé, si vous y avez assisté");
  }

  const review = await prisma.review.upsert({
    where: { user_id_entity_type_entity_id: { user_id: auth.sub, entity_type: "event", entity_id: params.id } },
    create: {
      user_id: auth.sub,
      entity_type: "event",
      entity_id: params.id,
      booking_ref_id: booking?.id ?? null,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
      is_verified: true,
    },
    update: {
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    },
    select: { id: true, rating: true, comment: true, created_at: true },
  });

  await recomputeRatingAvg(params.id);

  return NextResponse.json({
    review: { ...review, created_at: review.created_at.toISOString() },
  });
}
