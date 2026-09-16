/**
 * GET /api/payments/[id] — Statut d'un paiement (utilisé par la page /paiement/retour pour sonder).
 *
 * Réconciliation opportuniste : si la tentative de paiement la plus récente est encore
 * ouverte (initiated/pending) et vieille de plus de 90s, on la revérifie ici avant de
 * répondre — Vercel Hobby ne permet qu'un cron quotidien (voir
 * app/api/cron/reconcile-payments/route.ts), donc ce point d'entrée, déjà sondé toutes les 2s
 * par /paiement/retour pendant un paiement actif, sert de rattrapage quasi temps-réel. Un
 * échec de vérification ici est silencieux (best-effort) — voir verifyAndApplyPaymentAttempt,
 * qui ne change jamais de statut sur une simple erreur réseau/timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { verifyAndApplyPaymentAttempt } from "@/lib/payments/orchestrator";

const OPPORTUNISTIC_RECHECK_AFTER_SECONDS = 90;

async function loadPayment(id: string) {
  return prisma.payment.findUnique({
    where: { id },
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let payment = await loadPayment(params.id);
  if (!payment) {
    return apiError(404, "PAYMENT_NOT_FOUND", "Paiement introuvable");
  }
  if (payment.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }

  const latestAttempt = await prisma.paymentAttempt.findFirst({
    where: { payment_id: payment.id, status: { in: ["initiated", "pending"] } },
    orderBy: { initiated_at: "desc" },
    select: { id: true, initiated_at: true },
  });

  const cutoff = new Date(Date.now() - OPPORTUNISTIC_RECHECK_AFTER_SECONDS * 1000);
  if (latestAttempt && latestAttempt.initiated_at < cutoff) {
    try {
      await verifyAndApplyPaymentAttempt(latestAttempt.id);
      payment = (await loadPayment(params.id)) ?? payment; // reflète l'issue si elle a bougé
    } catch (err) {
      console.error(`[payments/[id]] Échec réconciliation opportuniste pour attempt ${latestAttempt.id}:`, err);
    }
  }

  return NextResponse.json(payment);
}
