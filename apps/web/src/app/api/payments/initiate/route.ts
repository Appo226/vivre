/**
 * POST /api/payments/initiate — Démarre un paiement mobile money pour une réservation en attente.
 * Retourne l'URL CinetPay hébergée (Orange Money, Moov Money, Telecel Money, et Wave si
 * disponible sur le compte CinetPay — voir lib/cinetpay.ts) vers laquelle rediriger le client.
 *
 * Passe par lib/payments/orchestrator.ts (initiatePayment) — crée toujours une PaymentAttempt
 * neuve, même sur un retry, pour préserver l'historique complet des tentatives.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { buildReturnUrl, buildNotifyUrl } from "@/lib/cinetpay";
import { isProviderAvailable } from "@/lib/payments/registry";
import { initiatePayment } from "@/lib/payments/orchestrator";
import { claimIdempotencyKey, resolveIdempotencyKey, failIdempotencyKey } from "@/lib/idempotency";

const InitiatePaymentSchema = z.object({ booking_id: z.string().uuid() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!isProviderAvailable("cinetpay")) {
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

  const idem = await claimIdempotencyKey(request, auth.sub, "payment_initiate", parsed.data);
  if (idem instanceof NextResponse) return idem;

  const customerName = [booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || "Client VIVRE";

  try {
    const outcome = await initiatePayment({
      userId: auth.sub,
      bookingType: "event",
      bookingId: booking.id,
      amountFcfa: booking.total_amount,
      platformFeeFcfa: booking.commission_fcfa,
      supplierAmountFcfa: booking.total_amount - booking.commission_fcfa,
      description: `Billet — ${booking.event.title}`,
      customerName,
      customerPhone: booking.user.phone,
      ...(booking.user.email && { customerEmail: booking.user.email }),
      provider: "cinetpay",
      existingPaymentId: booking.payment_id,
      returnUrl: buildReturnUrl,
      notifyUrl: buildNotifyUrl(),
    });

    const responseBody = { payment_id: outcome.payment.id, payment_url: outcome.redirectUrl };
    await resolveIdempotencyKey(idem, 200, responseBody, { type: "payment", id: outcome.payment.id });
    return NextResponse.json(responseBody);
  } catch (err) {
    // Panne de communication avec le provider — TRANSITOIRE, contrairement à un rejet métier
    // stable (survente, etc. dans /events/bookings). On libère la clé plutôt que de mettre en
    // cache l'échec, pour qu'un retry légitime (même sous la même clé, le frontend n'en génère
    // pas de nouvelle à chaque clic "Payer") puisse réellement retenter l'appel au provider.
    await failIdempotencyKey(idem);
    return apiError(502, "CINETPAY_ERROR", "Impossible d'initier le paiement", (err as Error).message);
  }
}
