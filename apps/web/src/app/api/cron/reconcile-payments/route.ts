/**
 * GET /api/cron/reconcile-payments — Réconciliation quotidienne des paiements/réservations.
 *
 * Déclenché une fois par jour par Vercel Cron (voir apps/web/vercel.json — le plan Hobby
 * n'autorise pas une fréquence plus fine ; GET /api/payments/[id] fait en plus une
 * réconciliation ponctuelle à chaque poll de /paiement/retour pour un rattrapage plus rapide
 * en pratique). L'ordre est un invariant documenté, pas un détail d'implémentation :
 * reconcileStalePayments() DOIT toujours se terminer avant expireStalePendingBookings() — voir
 * le tableau d'états dans lib/events.ts, l'annulation d'une commande "pending" dépend du fait
 * qu'un paiement réellement complété ait déjà eu le temps de la faire passer à "confirmed".
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { reconcileStalePayments } from "@/lib/payments/orchestrator";
import { expireStalePendingBookings } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "UNAUTHORIZED", "Accès réservé au cron");
  }

  const payments = await reconcileStalePayments();
  const bookings = await expireStalePendingBookings();

  return NextResponse.json({ message: "Réconciliation traitée", payments, bookings });
}
