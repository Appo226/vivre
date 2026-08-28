/**
 * PATCH /api/admin/refunds/[id]/decision — Traiter un remboursement (admin uniquement).
 * "complete" : l'admin a effectué le virement retour manuellement, on l'enregistre.
 * "reject"   : demande refusée, avec motif communiqué à l'acheteur.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { sendEmail, refundCompletedEmail, refundRejectedEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";

const DecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("reject"), rejection_note: z.string().min(5).max(500) }),
]);

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
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  const refund = await prisma.refund.findUnique({
    where: { id: params.id },
    select: {
      status: true,
      reason: true,
      amount: true,
      booking_id: true,
      payment: { select: { user: { select: { id: true, email: true } } } },
    },
  });
  if (!refund) {
    return apiError(404, "REFUND_NOT_FOUND", "Remboursement introuvable");
  }
  if (refund.status !== "pending") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${refund.status}" — rien à décider`);
  }

  // booking_id est polymorphique (transport|property|food|event) — pas de relation Prisma directe.
  const eventBooking = refund.booking_id
    ? await prisma.eventBooking.findUnique({ where: { id: refund.booking_id }, select: { event: { select: { title: true } } } })
    : null;
  const eventTitle = eventBooking?.event.title ?? "votre réservation";

  if (parsed.data.action === "complete") {
    await prisma.refund.update({
      where: { id: params.id },
      data: { status: "completed", processed_by: auth.sub, processed_at: new Date() },
    });
    void notify({
      userId: refund.payment.user.id,
      type: "refund_processed",
      title: "Remboursement effectué",
      body: `Votre remboursement de ${refund.amount.toLocaleString("fr-FR")} FCFA pour ${eventTitle} a été effectué.`,
    });
    void sendEmail({
      to: refund.payment.user.email,
      subject: "Votre remboursement a été effectué",
      html: refundCompletedEmail({ eventTitle, amountFcfa: refund.amount }),
    });
    return NextResponse.json({ message: "Remboursement marqué comme effectué", status: "completed" });
  }

  await prisma.refund.update({
    where: { id: params.id },
    data: {
      status: "rejected",
      processed_by: auth.sub,
      processed_at: new Date(),
      // On conserve le motif original de l'acheteur, en y ajoutant la décision de l'admin
      reason: `${refund.reason}\n\n[Refusé] ${parsed.data.rejection_note}`,
    },
  });
  void notify({
    userId: refund.payment.user.id,
    type: "refund_rejected",
    title: "Demande de remboursement refusée",
    body: `${eventTitle} : ${parsed.data.rejection_note}`,
  });
  void sendEmail({
    to: refund.payment.user.email,
    subject: "Votre demande de remboursement a été refusée",
    html: refundRejectedEmail({ eventTitle, note: parsed.data.rejection_note }),
  });
  return NextResponse.json({ message: "Remboursement refusé", status: "rejected" });
}
