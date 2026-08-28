/**
 * PATCH /api/ads/[id]/confirm-payment — Confirmer la réception du paiement (admin uniquement).
 * Passe la campagne à "paid" — dès que now() entre dans [start_date, end_date], elle apparaît
 * automatiquement dans GET /api/ads/active, sans autre action.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const campaign = await prisma.adCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return apiError(404, "AD_NOT_FOUND", "Campagne introuvable");
  }
  if (campaign.status !== "approved_unpaid") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${campaign.status}" — rien à confirmer`);
  }

  await prisma.adCampaign.update({
    where: { id: params.id },
    data: { status: "paid", paid_at: new Date(), confirmed_by: auth.sub },
  });

  return NextResponse.json({ message: "Paiement confirmé — la campagne se diffusera automatiquement sur sa fenêtre de dates.", status: "paid" });
}
