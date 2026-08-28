/**
 * GET /api/events/listing-pricing — Tarifs de mise en ligne/publicité applicables au compte
 * connecté (remise personnelle déjà appliquée) — pour afficher le coût avant soumission,
 * sans exposer tout /api/admin/settings (réservé aux admins) à n'importe quel organisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings, effectiveListingFeeFcfa, effectiveAdPricePerDayFcfa } from "@/lib/platform-settings";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const [settings, user] = await Promise.all([
    getPlatformSettings(),
    prisma.user.findUnique({ where: { id: auth.sub }, select: { fee_discount_percent: true } }),
  ]);
  const discount = user?.fee_discount_percent ?? 0;

  return NextResponse.json({
    free_period_enabled: settings.free_period_enabled,
    listing_fee_fcfa: effectiveListingFeeFcfa(settings, discount),
    ad_price_photo_fcfa_per_day: effectiveAdPricePerDayFcfa(settings, "image", discount),
    ad_price_video_fcfa_per_day: effectiveAdPricePerDayFcfa(settings, "video", discount),
  });
}
