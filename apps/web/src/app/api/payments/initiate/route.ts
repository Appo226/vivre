/**
 * POST /api/payments/initiate — Démarre un paiement mobile money pour une réservation en attente.
 * Retourne l'URL CinetPay hébergée (Orange Money, Moov Money, Telecel Money, et Wave si
 * disponible sur le compte CinetPay — voir lib/cinetpay.ts) vers laquelle rediriger le client.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { cinetpayConfigured, initiateCinetPayPayment, buildReturnUrl, buildNotifyUrl } from "@/lib/cinetpay";

const InitiatePaymentSchema = z.object({ booking_id: z.string().uuid() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!cinetpayConfigured()) {
    return apiError(
      503,
      "PAYMENTS_NOT_CONFIGURED",
      "Les paiements mobile money ne sont pas encore configurés. Réessayez plus tard ou contactez le support."
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = InitiatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "booking_id requis");
  }

  const booking = await prisma.eventBooking.findUnique({
    where: { id: parsed.data.booking_id },
    select: {
      id: true,
      user_id: true,
      status: true,
      total_amount: true,
      commission_fcfa: true,
      payment_id: true,
      event: { select: { title: true } },
      user: { select: { first_name: true, last_name: true, phone: true, email: true } },
    },
  });

  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Réservation introuvable");
  }
  if (booking.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (booking.status !== "pending") {
    return apiError(409, "BOOKING_NOT_PAYABLE", `Cette réservation est en statut "${booking.status}" — aucun paiement à effectuer`);
  }
  if (booking.total_amount <= 0) {
    return apiError(409, "BOOKING_ALREADY_FREE", "Ce billet est gratuit — aucun paiement requis");
  }

  const payment = booking.payment_id
    ? await prisma.payment.update({
        where: { id: booking.payment_id },
        data: { status: "pending" },
        select: { id: true },
      })
    : await prisma.payment.create({
        data: {
          user_id: auth.sub,
          amount: booking.total_amount,
          payment_method: "pending",
          status: "pending",
          booking_type: "event",
          booking_id: booking.id,
          platform_fee: booking.commission_fcfa,
          supplier_amount: booking.total_amount - booking.commission_fcfa,
        },
        select: { id: true },
      });

  if (!booking.payment_id) {
    await prisma.eventBooking.update({ where: { id: booking.id }, data: { payment_id: payment.id } });
  }

  const customerName = [booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || "Client VIVRE";

  try {
    const result = await initiateCinetPayPayment({
      transactionId: payment.id,
      amountFcfa: booking.total_amount,
      description: `Billet — ${booking.event.title}`,
      customerName,
      customerPhone: booking.user.phone,
      ...(booking.user.email && { customerEmail: booking.user.email }),
      returnUrl: buildReturnUrl(payment.id),
      notifyUrl: buildNotifyUrl(),
    });

    await prisma.payment.update({ where: { id: payment.id }, data: { provider_ref: result.paymentToken } });

    return NextResponse.json({ payment_id: payment.id, payment_url: result.paymentUrl });
  } catch (err) {
    return apiError(502, "CINETPAY_ERROR", "Impossible d'initier le paiement", (err as Error).message);
  }
}
