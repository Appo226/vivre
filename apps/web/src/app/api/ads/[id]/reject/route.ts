/**
 * PATCH /api/ads/[id]/reject — Rejeter une campagne avec raison (admin uniquement).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { RejectAdSchema } from "@/lib/schemas/ads";
import { notify } from "@/lib/notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = RejectAdSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Raison requise");
  }

  const campaign = await prisma.adCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return apiError(404, "AD_NOT_FOUND", "Campagne introuvable");
  }
  if (campaign.status !== "pending_review") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${campaign.status}" — rien à rejeter`);
  }

  await prisma.adCampaign.update({
    where: { id: params.id },
    data: { status: "rejected", rejection_reason: parsed.data.reason },
  });

  void notify({
    userId: campaign.advertiser_id,
    type: "ad_rejected",
    title: "Votre publicité n'a pas été approuvée",
    body: `${campaign.title} : ${parsed.data.reason}`,
    data: { ad_id: params.id },
  });

  return NextResponse.json({ message: "Campagne rejetée", status: "rejected" });
}
