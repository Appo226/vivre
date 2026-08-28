/**
 * PATCH /api/ads/[id]/approve — Approuver une campagne (admin uniquement).
 *
 * Fige le prix maintenant (jours × tarif de l'emplacement en vigueur aujourd'hui) — un
 * changement de tarif plus tard n'affecte pas une campagne déjà approuvée. Statut passe à
 * "approved_unpaid" : l'annonceur doit encore payer avant toute diffusion.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings } from "@/lib/platform-settings";
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

  const campaign = await prisma.adCampaign.findUnique({ where: { id: params.id } });
  if (!campaign) {
    return apiError(404, "AD_NOT_FOUND", "Campagne introuvable");
  }
  if (campaign.status !== "pending_review") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${campaign.status}" — rien à approuver`);
  }

  const settings = await getPlatformSettings();
  const ratePerDay = campaign.placement === "home_feed"
    ? settings.ad_price_home_feed_fcfa_per_day
    : settings.ad_price_browse_fcfa_per_day;
  const days = Math.max(1, Math.ceil((campaign.end_date.getTime() - campaign.start_date.getTime()) / 86_400_000));
  const priceFcfa = days * ratePerDay;

  await prisma.adCampaign.update({
    where: { id: params.id },
    data: {
      status: "approved_unpaid",
      price_fcfa: priceFcfa,
      approved_by: auth.sub,
      approved_at: new Date(),
    },
  });

  void notify({
    userId: campaign.advertiser_id,
    type: "ad_approved",
    title: "Votre publicité est approuvée",
    body: `${campaign.title} est approuvée — ${priceFcfa.toLocaleString("fr-FR")} FCFA à régler avant diffusion.`,
    data: { ad_id: params.id },
  });

  return NextResponse.json({ message: "Campagne approuvée", status: "approved_unpaid", price_fcfa: priceFcfa });
}
