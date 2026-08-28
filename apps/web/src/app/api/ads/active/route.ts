/**
 * GET /api/ads/active?placement=home_feed — Publicités actuellement diffusées (public).
 *
 * Aucun statut "active" stocké : le filtre est calculé en direct sur (status=paid AND
 * now() dans [start_date, end_date]) — même principe que sale_starts_at/sale_ends_at sur
 * EventTicketType. Une pub payée démarre et s'arrête toute seule, sans tâche planifiée.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { AdPlacementSchema } from "@/lib/schemas/ads";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = AdPlacementSchema.safeParse(request.nextUrl.searchParams.get("placement"));
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "placement doit être 'home_feed' ou 'browse_tile'");
  }
  const placement = parsed.data;
  const now = new Date();

  const campaigns = await prisma.adCampaign.findMany({
    where: { placement, status: "paid", start_date: { lte: now }, end_date: { gte: now } },
    select: { id: true, title: true, image_url: true, media_type: true, link_url: true },
    orderBy: { created_at: "asc" },
  });

  // Best-effort — une pub non comptée de temps en temps n'est pas grave, ne jamais faire
  // échouer l'affichage public à cause d'un souci de tracking.
  if (campaigns.length > 0) {
    void prisma.adCampaign
      .updateMany({ where: { id: { in: campaigns.map((c: { id: string }) => c.id) } }, data: { impressions_count: { increment: 1 } } })
      .catch(() => {});
  }

  return NextResponse.json({ campaigns });
}
