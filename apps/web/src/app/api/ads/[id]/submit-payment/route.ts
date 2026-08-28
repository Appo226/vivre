/**
 * PATCH /api/ads/[id]/submit-payment — L'annonceur signale avoir envoyé le paiement mobile
 * money (propriétaire uniquement). Ne change pas le statut — juste de quoi faire apparaître
 * la campagne dans la file "en attente de confirmation" de l'admin (voir GET /api/admin/ads).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { SubmitAdPaymentSchema } from "@/lib/schemas/ads";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = SubmitAdPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Référence de paiement requise");
  }

  const campaign = await prisma.adCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return apiError(404, "AD_NOT_FOUND", "Campagne introuvable");
  }
  if (campaign.advertiser_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (campaign.status !== "approved_unpaid") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${campaign.status}" — aucun paiement attendu`);
  }

  await prisma.adCampaign.update({
    where: { id: params.id },
    data: { payment_reference_note: parsed.data.reference_note, payment_submitted_at: new Date() },
  });

  return NextResponse.json({ message: "Paiement signalé. Un admin va confirmer la réception." });
}
