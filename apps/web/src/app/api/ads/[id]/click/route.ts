/**
 * POST /api/ads/[id]/click — Incrémente le compteur de clics (public, fire-and-forget).
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  await prisma.adCampaign.updateMany({
    where: { id: params.id, status: "paid" },
    data: { clicks_count: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
