/**
 * GET /api/admin/refunds — File des remboursements (admin uniquement). ?status=pending|completed|rejected
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

  const status = request.nextUrl.searchParams.get("status") ?? "pending";

  const refunds = await prisma.refund.findMany({
    where: { status, booking_type: { in: ["event", "event_listing"] } },
    select: {
      id: true,
      amount: true,
      reason: true,
      status: true,
      refund_method: true,
      booking_id: true,
      created_at: true,
      payment: { select: { user: { select: { first_name: true, last_name: true, phone: true } } } },
    },
    orderBy: { created_at: "asc" },
  });

  type Refund = (typeof refunds)[number];
  return NextResponse.json({
    refunds: refunds.map((r: Refund) => ({ ...r, created_at: r.created_at.toISOString() })),
  });
}
