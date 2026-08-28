/**
 * GET /api/ads/[id] — Détail d'une campagne (propriétaire ou admin uniquement).
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

  const campaign = await prisma.adCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return apiError(404, "AD_NOT_FOUND", "Campagne introuvable");
  }
  if (campaign.advertiser_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  return NextResponse.json({ campaign });
}
