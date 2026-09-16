/**
 * POST /api/payments/webhook — Webhook IPN CinetPay.
 *
 * SÉCURITÉ : on ne fait JAMAIS confiance au seul payload reçu — verifyAndApplyPaymentAttempt()
 * rappelle systématiquement le provider pour confirmer le statut avant de modifier quoi que ce
 * soit. Protège contre les faux webhooks et les attaques par rejeu.
 *
 * Le transaction_id envoyé par CinetPay EST l'id de la PaymentAttempt (voir
 * lib/payments/adapters/cinetpay-adapter.ts) — plus l'id du Payment lui-même, ce qui permet à
 * chaque tentative/retry d'avoir son propre historique au lieu d'écraser une ligne partagée.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { verifyAndApplyPaymentAttempt } from "@/lib/payments/orchestrator";

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

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: transactionId },
    select: { id: true },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Tentative de paiement introuvable" }, { status: 404 });
  }

  try {
    await verifyAndApplyPaymentAttempt(attempt.id);
  } catch (err) {
    console.error(`[payments/webhook] Échec traitement attempt ${attempt.id}:`, err);
    return NextResponse.json({ error: "Échec du traitement du webhook" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
