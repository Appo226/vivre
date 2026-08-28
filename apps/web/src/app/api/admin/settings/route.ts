/**
 * GET   /api/admin/settings — Lire les paramètres globaux (frais, interrupteurs).
 * PATCH /api/admin/settings — Modifier (admin uniquement) — effectif immédiatement, sans redéploiement.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings } from "@/lib/platform-settings";

const UpdateSettingsSchema = z.object({
  organizer_fee_percent: z.number().min(0).max(50).optional(),
  buyer_fee_percent: z.number().min(0).max(50).optional(),
  buyer_fee_flat_fcfa: z.number().int().min(0).optional(),
  free_period_enabled: z.boolean().optional(),
  discounts_enabled: z.boolean().optional(),
  payout_delay_new_organizer_days: z.number().int().min(0).max(60).optional(),
  payout_delay_trusted_organizer_days: z.number().int().min(0).max(60).optional(),
  trusted_organizer_event_threshold: z.number().int().min(1).max(50).optional(),
  ad_price_home_feed_fcfa_per_day: z.number().int().min(0).optional(),
  ad_price_browse_fcfa_per_day: z.number().int().min(0).optional(),
  greeting_message: z.string().trim().min(1).max(120).optional(),
  greeting_message_enabled: z.boolean().optional(),
  home_subtitle: z.string().trim().min(1).max(160).optional(),
  hero_banner_enabled: z.boolean().optional(),
  hero_banner_media_type: z.enum(["image", "video"]).optional(),
  hero_banner_image_url: z.string().url().nullable().optional(),
  hero_banner_link_url: z.string().url().nullable().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }
  return NextResponse.json(await getPlatformSettings());
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  // exactOptionalPropertyTypes interdit les clés explicitement `undefined` dans l'input Prisma —
  // on ne garde que les champs réellement fournis.
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

  const updated = await prisma.platformSettings.upsert({
    where: { id: "default" },
    update: { ...changes, updated_by: auth.sub },
    create: { id: "default", ...changes, updated_by: auth.sub },
  });

  return NextResponse.json(updated);
}
