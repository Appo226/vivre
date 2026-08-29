/**
 * POST /api/events/[id]/request-refund — L'organisateur demande le remboursement des frais
 * de mise en ligne (+ pub éventuelle) d'un événement REJETÉ, plutôt que de le corriger et le
 * resoumettre (voir PATCH /events/[id]/submit, qui réutilise le paiement existant s'il n'a
 * pas été remboursé). Symétrique de l'option "rembourser immédiatement" que l'admin peut
 * cocher au moment du rejet (voir /events/[id]/reject) — ici c'est l'organisateur qui décide,
 * après coup, qu'il ne va pas corriger et resoumettre.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { refundEventListingPayment } from "@/lib/events";
import { notify } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, status: true, organizer_id: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (event.status !== "rejected") {
    return apiError(409, "NOT_REJECTED", "Seul un événement rejeté peut faire l'objet d'une demande de remboursement");
  }

  const result = await refundEventListingPayment(event.id);

  if (result.outcome === "no_payment") {
    return apiError(409, "NO_PAYMENT_TO_REFUND", "Aucun frais payé pour cet événement — rien à rembourser");
  }
  if (result.outcome === "already_refunded") {
    return apiError(409, "ALREADY_REQUESTED", "Un remboursement est déjà en cours de traitement pour cet événement");
  }

  // Best-effort — notifie aussi l'équipe VIVRE côté admin en créant l'entrée directement dans
  // la file de remboursement (déjà fait par refundEventListingPayment) ; pas de notification
  // admin dédiée aujourd'hui, la file /admin/remboursements est le point de vérité.
  void notify({
    userId: auth.sub,
    type: "refund_processed",
    title: "Demande de remboursement enregistrée",
    body: `Votre demande de remboursement pour "${event.title}" (${result.amountFcfa.toLocaleString("fr-FR")} FCFA) est en cours de traitement.`,
    data: { event_id: event.id },
  });

  return NextResponse.json({
    message: `Demande enregistrée — remboursement de ${result.amountFcfa.toLocaleString("fr-FR")} FCFA en cours de traitement.`,
    amount_fcfa: result.amountFcfa,
  });
}
