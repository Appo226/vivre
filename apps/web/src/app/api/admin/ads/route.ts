/**
 * GET /api/admin/ads — File des campagnes publicitaires par statut (admin uniquement).
 * ?status=pending_review|approved_unpaid|paid|rejected (défaut : pending_review)
 *
 * Pour "approved_unpaid", trie les campagnes avec payment_submitted_at (en attente de
 * confirmation) en premier — c'est la file de travail réelle de l'admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const status = request.nextUrl.searchParams.get("status") ?? "pending_review";

  const campaigns = await prisma.adCampaign.findMany({
    where: { status },
    select: {
      id: true, title: true, image_url: true, media_type: true, link_url: true, placement: true,
      start_date: true, end_date: true, price_fcfa: true, status: true,
      payment_reference_note: true, payment_submitted_at: true,
      created_at: true,
      advertiser: { select: { id: true, first_name: true, last_name: true, phone: true } },
    },
    orderBy: status === "approved_unpaid"
      ? [{ payment_submitted_at: { sort: "desc", nulls: "last" } }]
      : { created_at: "asc" },
  });

  return NextResponse.json({ campaigns });
}
