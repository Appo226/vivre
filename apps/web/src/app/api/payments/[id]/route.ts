/**
 * GET /api/payments/[id] — Statut d'un paiement (utilisé par la page /paiement/retour pour sonder).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      user_id: true,
      status: true,
      amount: true,
      payment_method: true,
      booking_type: true,
      booking_id: true,
      paid_at: true,
      failed_at: true,
      failure_reason: true,
    },
  });
  if (!payment) {
    return apiError(404, "PAYMENT_NOT_FOUND", "Paiement introuvable");
  }
  if (payment.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  return NextResponse.json(payment);
}
