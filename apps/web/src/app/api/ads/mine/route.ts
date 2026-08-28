/**
 * GET /api/ads/mine — Mes campagnes publicitaires (annonceur connecté).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const campaigns = await prisma.adCampaign.findMany({
    where: { advertiser_id: auth.sub },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ campaigns });
}
