/**
 * GET /api/events/[id]/promo-codes/validate?code=X&quantity=2 — Valide un code au checkout
 * (avant de créer la réservation) pour l'affichage immédiat de la réduction.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { validatePromoCode } from "@/lib/promo-codes";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const code = request.nextUrl.searchParams.get("code");
  const ticketTypeId = request.nextUrl.searchParams.get("ticket_type_id");
  const quantity = Number(request.nextUrl.searchParams.get("quantity") ?? "1");

  if (!code || !ticketTypeId) {
    return apiError(422, "VALIDATION_ERROR", "code et ticket_type_id requis");
  }

  const ticketType = await prisma.eventTicketType.findUnique({
    where: { id: ticketTypeId },
    select: { price_fcfa: true, event_id: true },
  });
  if (!ticketType || ticketType.event_id !== params.id) {
    return apiError(404, "TICKET_TYPE_NOT_FOUND", "Type de billet introuvable");
  }

  const subtotal = ticketType.price_fcfa * quantity;
  const result = await validatePromoCode(code, params.id, auth.sub, subtotal);

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error });
  }
  return NextResponse.json({
    valid: true,
    discount_fcfa: result.discountFcfa,
    total_after_discount: subtotal - (result.discountFcfa ?? 0),
  });
}
