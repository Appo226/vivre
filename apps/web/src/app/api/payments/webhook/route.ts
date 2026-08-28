/**
 * POST /api/payments/webhook — Webhook IPN CinetPay.
 *
 * SÉCURITÉ : on ne fait JAMAIS confiance au seul payload reçu — on rappelle systématiquement
 * verifyCinetPayPayment() pour confirmer le statut directement auprès de CinetPay avant de
 * modifier quoi que ce soit. Protège contre les faux webhooks et les attaques par rejeu.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { verifyCinetPayPayment } from "@/lib/cinetpay";
import { generateEventQr, notifyEventPendingApproval } from "@/lib/events";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CinetPay envoie son IPN en x-www-form-urlencoded ; on accepte aussi du JSON par sécurité.
  let body: Record<string, unknown> | null = null;
  try {
    const formData = await request.clone().formData();
    body = Object.fromEntries(formData.entries());
  } catch {
    body = await request.json().catch(() => null);
  }

  const transactionId = body?.["cpm_trans_id"] ?? body?.["transaction_id"];
  if (!transactionId || typeof transactionId !== "string") {
    return NextResponse.json({ error: "transaction_id manquant" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true, booking_id: true, booking_type: true },
  });
  if (!payment) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }
  if (payment.status === "completed") {
    return NextResponse.json({ ok: true }); // déjà traité — idempotent
  }

  let verification;
  try {
    verification = await verifyCinetPayPayment(transactionId);
  } catch {
    return NextResponse.json({ error: "Échec de la vérification CinetPay" }, { status: 502 });
  }

  if (verification.status === "completed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "completed",
        payment_method: verification.paymentMethod ?? "unknown",
        paid_at: new Date(),
      },
    });

    if (payment.booking_type === "event") {
      const booking = await prisma.eventBooking.update({
        where: { id: payment.booking_id },
        data: { status: "confirmed" },
        select: { id: true, event_id: true, user_id: true, quantity: true, ticket_type: { select: { name: true } } },
      });
      const qrCode = generateEventQr(booking.id, booking.event_id, booking.user_id, booking.ticket_type.name, booking.quantity);
      await prisma.eventBooking.update({ where: { id: booking.id }, data: { qr_code: qrCode } });
    } else if (payment.booking_type === "event_listing") {
      const event = await prisma.event.update({
        where: { id: payment.booking_id },
        data: { status: "pending_approval", has_paid_publishing: true },
        select: {
          id: true,
          title: true,
          organizer: { select: { id: true, phone: true, email: true } },
        },
      });
      void notifyEventPendingApproval(event);
    }
  } else if (verification.status === "failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failed_at: new Date(), failure_reason: "Refusé par CinetPay" },
    });
  }
  // "pending" → ne rien faire, CinetPay renverra un autre IPN plus tard

  return NextResponse.json({ ok: true });
}
