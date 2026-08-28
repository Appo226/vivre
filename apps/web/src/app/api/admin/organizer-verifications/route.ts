/**
 * GET /api/admin/organizer-verifications — File d'attente de vérification (admin uniquement).
 * ?status=pending_review|verified|rejected|unverified (défaut : pending_review)
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

  const verifications = await prisma.organizerVerification.findMany({
    where: { status },
    select: {
      id: true,
      status: true,
      id_document_type: true,
      id_document_holder_name: true,
      payout_provider: true,
      payout_phone: true,
      payout_account_name: true,
      phone_call_confirmed_at: true,
      created_at: true,
      user: { select: { id: true, phone: true, first_name: true, last_name: true } },
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({ verifications });
}
