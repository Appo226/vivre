/**
 * POST /api/ads — Soumettre une campagne publicitaire (n'importe quel utilisateur connecté).
 * Créée en "pending_review" — aucun prix figé tant qu'un admin n'a pas approuvé (le tarif
 * par jour peut changer entre la soumission et la revue, voir PATCH /api/ads/[id]/approve).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { CreateAdCampaignSchema } from "@/lib/schemas/ads";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateAdCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const data = parsed.data;

  if (new Date(data.start_date) < new Date()) {
    return apiError(422, "START_DATE_IN_PAST", "La date de début doit être dans le futur");
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      advertiser_id: auth.sub,
      title: data.title,
      image_url: data.image_url,
      media_type: data.media_type,
      link_url: data.link_url ?? null,
      placement: data.placement,
      start_date: new Date(data.start_date),
      end_date: new Date(data.end_date),
      price_fcfa: 0, // Figé à l'approbation
      status: "pending_review",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json(
    { ...campaign, message: "Campagne soumise pour revue. Vous serez notifié une fois approuvée." },
    { status: 201 }
  );
}
