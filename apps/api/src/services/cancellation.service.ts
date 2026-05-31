/**
 * services/cancellation.service.ts — Moteur de remboursement VIVRE
 *
 * Calcul et exécution des remboursements pour toutes les entités :
 *   transport, property, food (orders), events
 *
 * Règles métier :
 *   - VIVRE garde toujours sa commission (platform_fee) sur les annulations
 *   - Seul le supplier_amount est remboursé (partiellement ou intégralement)
 *   - Méthode vivre_credit → crédit instantané au portefeuille
 *   - Méthode mobile_money → Refund "pending" traité manuellement par admin
 *
 * Politique d'annulation par type :
 *   "flexible"       → remboursement intégral jusqu'au seuil
 *   "moderate"       → fenêtre partielle + fenêtre intégrale
 *   "strict"         → fenêtre réduite pour intégral, pas de partiel
 *   "non_refundable" → aucun remboursement
 */

import { prisma } from "@vivre/database";

/* ============================================================
 * TYPES
 * ============================================================ */

export type CancelPolicy = "flexible" | "moderate" | "strict" | "non_refundable";
export type RefundMethod = "vivre_credit" | "mobile_money";
export type BookingType = "transport" | "property" | "food" | "event";

export interface PolicyFields {
  cancel_policy: string;
  cancel_full_refund_h: number | null;
  cancel_partial_h: number | null;
  cancel_partial_pct: number | null;
}

export interface RefundCalculation {
  refund_amount: number;     // FCFA à rembourser
  refund_pct: number;        // Pourcentage (0–100) pour affichage
  policy_label: string;      // Texte lisible pour l'utilisateur
  allowed: boolean;          // false = aucun remboursement possible
}

/* ============================================================
 * CALCUL DU REMBOURSEMENT
 * ============================================================ */

/**
 * Calcule le montant à rembourser selon la politique et les heures restantes.
 *
 * @param policy     Champs de politique de la Route / Property
 * @param supplierAmount  Montant supplier du paiement (hors commission VIVRE)
 * @param hoursUntil Heures avant le départ / check-in / début de l'événement
 */
export function computeRefundAmount(
  policy: PolicyFields,
  supplierAmount: number,
  hoursUntil: number
): RefundCalculation {
  const p = policy.cancel_policy as CancelPolicy;

  if (p === "non_refundable") {
    return { refund_amount: 0, refund_pct: 0, policy_label: "Non remboursable", allowed: false };
  }

  const fullH = policy.cancel_full_refund_h ?? 0;
  const partialH = policy.cancel_partial_h ?? 0;
  const partialPct = policy.cancel_partial_pct ?? 50;

  /* Remboursement intégral */
  if (hoursUntil >= fullH) {
    return {
      refund_amount: supplierAmount,
      refund_pct: 100,
      policy_label: `Remboursement intégral (annulation > ${fullH}h avant)`,
      allowed: true,
    };
  }

  /* Remboursement partiel */
  if (partialH > 0 && hoursUntil >= partialH) {
    const amount = Math.floor((supplierAmount * partialPct) / 100);
    return {
      refund_amount: amount,
      refund_pct: partialPct,
      policy_label: `Remboursement partiel ${partialPct}% (annulation entre ${partialH}h et ${fullH}h avant)`,
      allowed: true,
    };
  }

  /* Fenêtre dépassée — aucun remboursement */
  return {
    refund_amount: 0,
    refund_pct: 0,
    policy_label: "Délai d'annulation dépassé — aucun remboursement",
    allowed: false,
  };
}

/**
 * Retourne les champs de politique par défaut selon le type (flexible par défaut).
 * Utilisé quand une entité n'a pas encore de politique configurée.
 */
export function defaultPolicy(type: "property" | "transport"): PolicyFields {
  if (type === "transport") {
    return {
      cancel_policy: "moderate",
      cancel_full_refund_h: 24,
      cancel_partial_h: 2,
      cancel_partial_pct: 50,
    };
  }
  return {
    cancel_policy: "strict",
    cancel_full_refund_h: 72,
    cancel_partial_h: null,
    cancel_partial_pct: null,
  };
}

/* ============================================================
 * EXÉCUTION DU REMBOURSEMENT
 * ============================================================ */

/**
 * Crée un enregistrement Refund et, si la méthode est vivre_credit,
 * crédite immédiatement le portefeuille de l'utilisateur.
 *
 * Pour mobile_money : crée le Refund en "pending" — un admin le valide.
 */
export async function executeRefund(params: {
  paymentId: string;
  userId: string;
  amount: number;
  reason: string;
  method: RefundMethod;
  bookingType: BookingType;
  bookingId: string;
  description: string;
}): Promise<{ refundId: string; walletBalance?: number }> {
  const { paymentId, userId, amount, reason, method, bookingType, bookingId, description } =
    params;

  if (amount <= 0) {
    throw new Error("Montant de remboursement invalide");
  }

  /* Créer le Refund */
  const refund = await prisma.refund.create({
    data: {
      payment_id: paymentId,
      amount,
      reason,
      status: method === "vivre_credit" ? "completed" : "pending",
      refund_method: method,
      booking_type: bookingType,
      booking_id: bookingId,
      ...(method === "vivre_credit" ? { processed_at: new Date() } : {}),
    },
  });

  if (method !== "vivre_credit") {
    return { refundId: refund.id };
  }

  /* Créer ou incrémenter le portefeuille */
  const wallet = await prisma.vivreWallet.upsert({
    where: { user_id: userId },
    update: { balance_fcfa: { increment: amount } },
    create: { user_id: userId, balance_fcfa: amount },
  });

  await prisma.walletTransaction.create({
    data: {
      wallet_id: wallet.id,
      amount_fcfa: amount,
      type: "refund",
      reference_id: refund.id,
      description,
    },
  });

  return { refundId: refund.id, walletBalance: wallet.balance_fcfa + amount };
}

/* ============================================================
 * HELPERS UTILITAIRES
 * ============================================================ */

/** Retourne les heures entre maintenant et une date future. Négatif si passé. */
export function hoursUntil(date: Date): number {
  return (date.getTime() - Date.now()) / (1000 * 60 * 60);
}
