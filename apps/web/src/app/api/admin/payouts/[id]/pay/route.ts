/**
 * PATCH /api/admin/payouts/[id]/pay — Marquer un versement comme payé.
 * L'admin a déjà effectué le virement mobile money manuellement — ceci enregistre la référence.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { notify } from "@/lib/notifications";

const PayoutDecisionSchema = z.object({ payout_reference: z.string().min(3).max(200) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = PayoutDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "payout_reference requis");
  }

  const payout = await prisma.eventPayout.findUnique({
    where: { id: params.id },
    select: { status: true, organizer_id: true, net_amount_fcfa: true, event: { select: { title: true } } },
  });
  if (!payout) {
    return apiError(404, "PAYOUT_NOT_FOUND", "Versement introuvable");
  }
  if (payout.status !== "eligible") {
    return apiError(409, "NOT_ELIGIBLE", `Statut actuel "${payout.status}" — pas encore éligible ou déjà payé`);
  }

  await prisma.eventPayout.update({
    where: { id: params.id },
    data: {
      status: "paid",
      paid_at: new Date(),
      paid_by: auth.sub,
      payout_reference: parsed.data.payout_reference,
    },
  });

  void notify({
    userId: payout.organizer_id,
    type: "payout_sent",
    title: "Versement envoyé",
    body: `${payout.net_amount_fcfa.toLocaleString("fr-FR")} FCFA pour ${payout.event.title} ont été envoyés.`,
    data: { payout_id: params.id },
  });

  return NextResponse.json({ message: "Versement marqué comme payé", status: "paid" });
}
