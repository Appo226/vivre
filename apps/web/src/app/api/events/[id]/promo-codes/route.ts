/**
 * POST /api/events/[id]/promo-codes — L'organisateur crée un code promo pour SON événement.
 * GET  /api/events/[id]/promo-codes — L'organisateur liste ses codes (avec compteur d'usage).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const CreatePromoCodeSchema = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Z0-9_-]+$/, "Majuscules, chiffres, tirets uniquement"),
  discount_type: z.enum(["percent", "fixed_fcfa"]),
  discount_value: z.number().int().min(1),
  max_uses: z.number().int().min(1).optional(),
  max_uses_per_user: z.number().int().min(1).default(1),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
});

async function assertOwnsEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizer_id: true } });
  if (!event) return { error: apiError(404, "EVENT_NOT_FOUND", "Événement introuvable") };
  if (event.organizer_id !== userId) return { error: apiError(403, "AUTH_FORBIDDEN", "Accès refusé") };
  return { error: null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { error } = await assertOwnsEvent(params.id, auth.sub);
  if (error) return error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreatePromoCodeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const data = parsed.data;

  if (data.discount_type === "percent" && data.discount_value > 100) {
    return apiError(422, "INVALID_DISCOUNT", "Une réduction en pourcentage ne peut pas dépasser 100");
  }

  const existing = await prisma.promoCode.findUnique({ where: { code: data.code } });
  if (existing) {
    return apiError(409, "CODE_TAKEN", "Ce code existe déjà — choisissez-en un autre");
  }

  const promo = await prisma.promoCode.create({
    data: {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      max_uses: data.max_uses ?? null,
      max_uses_per_user: data.max_uses_per_user,
      applies_to: "event",
      event_id: params.id,
      created_by: auth.sub,
      valid_from: new Date(data.valid_from),
      valid_until: new Date(data.valid_until),
      is_active: true,
    },
    select: { id: true, code: true, discount_type: true, discount_value: true },
  });

  return NextResponse.json(promo, { status: 201 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { error } = await assertOwnsEvent(params.id, auth.sub);
  if (error) return error;

  const codes = await prisma.promoCode.findMany({
    where: { event_id: params.id },
    select: {
      id: true, code: true, discount_type: true, discount_value: true,
      max_uses: true, uses_count: true, is_active: true, valid_from: true, valid_until: true,
    },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ codes });
}
