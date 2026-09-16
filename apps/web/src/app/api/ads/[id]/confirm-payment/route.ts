/**
 * PATCH /api/ads/[id]/confirm-payment — Confirmer la réception du paiement (admin uniquement).
 * Passe la campagne à "paid" — dès que now() entre dans [start_date, end_date], elle apparaît
 * automatiquement dans GET /api/ads/active, sans autre action.
 *
 * Depuis Stage 1, passe par lib/payments/orchestrator.ts (confirmManualPayment) — la campagne
 * obtient un vrai Payment+PaymentAttempt via booking_type="ad_campaign" (100% revenu VIVRE, pas
 * de répartition organisateur) au lieu de son ancien mécanisme ad-hoc isolé.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { confirmManualPayment } from "@/lib/payments/orchestrator";

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

  await confirmManualPayment({
    userId: campaign.advertiser_id,
    bookingType: "ad_campaign",
    bookingId: campaign.id,
    existingPaymentId: campaign.payment_id,
    amountFcfa: campaign.price_fcfa,
    platformFeeFcfa: campaign.price_fcfa,
    supplierAmountFcfa: 0,
    referenceNote: campaign.payment_reference_note ?? "Confirmé par admin sans référence transmise",
    confirmedByUserId: auth.sub,
  });

  return NextResponse.json({ message: "Paiement confirmé — la campagne se diffusera automatiquement sur sa fenêtre de dates.", status: "paid" });
}
