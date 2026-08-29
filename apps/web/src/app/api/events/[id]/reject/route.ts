/**
 * PATCH /api/events/[id]/reject — Rejeter un événement payant avec raison (admin uniquement).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { RejectEventSchema } from "@/lib/schemas/events";
import { sendEmail, eventRejectedEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";
import { refundEventListingPayment } from "@/lib/events";

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
  const parsed = RejectEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Raison requise");
  }

  const { id } = params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true, organizer: { select: { id: true, email: true } } },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }

  await prisma.event.update({
    where: { id },
    data: { status: "rejected", rejection_reason: parsed.data.reason },
  });

  let refundResult: Awaited<ReturnType<typeof refundEventListingPayment>> | null = null;
  if (parsed.data.refund_now) {
    refundResult = await refundEventListingPayment(id);
  }
  const refunded = refundResult?.outcome === "created";

  void notify({
    userId: event.organizer.id,
    type: "event_rejected",
    title: "Votre événement n'a pas été approuvé",
    body: refunded
      ? `${parsed.data.reason} Un remboursement de ${refundResult && "amountFcfa" in refundResult ? refundResult.amountFcfa.toLocaleString("fr-FR") : ""} FCFA a été mis en file de traitement.`
      : parsed.data.reason,
    data: { event_id: id },
  });

  void sendEmail({
    to: event.organizer.email,
    subject: `${event.title} n'a pas été approuvé`,
    html: eventRejectedEmail({
      eventTitle: event.title,
      reason: parsed.data.reason,
      editUrl: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/publier`,
    }),
  });

  return NextResponse.json({
    message: refunded
      ? "Événement rejeté. Remboursement mis en file de traitement — voir la file des remboursements."
      : "Événement rejeté. L'organisateur sera notifié.",
    event_id: id,
    refund: refundResult,
  });
}
