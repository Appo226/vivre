/**
 * GET /api/admin/payouts — File des versements organisateurs (admin uniquement).
 * ?status=held|eligible|paid|on_hold_dispute (défaut : eligible — ce qui reste à payer)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { syncPendingPayouts } from "@/lib/event-payout";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  await syncPendingPayouts();

  const status = request.nextUrl.searchParams.get("status") ?? "eligible";

  const payouts = await prisma.eventPayout.findMany({
    where: { status },
    select: {
      id: true,
      gross_amount_fcfa: true,
      commission_fcfa: true,
      net_amount_fcfa: true,
      status: true,
      eligible_at: true,
      paid_at: true,
      payout_reference: true,
      event: { select: { id: true, title: true, ends_at: true } },
      organizer: { select: { id: true, first_name: true, last_name: true, phone: true } },
    },
    orderBy: { eligible_at: "asc" },
  });

  // Le compte de versement se lit dans OrganizerVerification, pas ici — jointure légère
  type Payout = (typeof payouts)[number];
  const organizerIds = [...new Set(payouts.map((p: Payout) => p.organizer.id))];
  const payoutAccounts = await prisma.organizerVerification.findMany({
    where: { user_id: { in: organizerIds } },
    select: { user_id: true, payout_provider: true, payout_phone: true, payout_account_name: true },
  });
  type PayoutAccount = (typeof payoutAccounts)[number];
  const accountByOrganizer = new Map(payoutAccounts.map((a: PayoutAccount) => [a.user_id, a]));

  return NextResponse.json({
    payouts: payouts.map((p: Payout) => ({
      ...p,
      payout_account: accountByOrganizer.get(p.organizer.id) ?? null,
    })),
  });
}
