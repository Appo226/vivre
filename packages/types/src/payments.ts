/**
 * payments.ts — Types pour le module Paiements de VIVRE
 *
 * VIVRE supporte 5 méthodes de paiement :
 * 1. Orange Money — Mobile Money dominant, ~60% des transactions
 * 2. Moov Money — Second Mobile Money burkinabè
 * 3. Wave — En expansion rapide (moins de frais)
 * 4. Carte bancaire (Stripe) — Pour les touristes et expatriés
 * 5. Cash — Pour les zones rurales et les personnes non-bancarisées
 *
 * Flow Orange/Moov :
 * 1. Client sélectionne Orange Money
 * 2. API génère un USSD code (ex: *144*1*XXXXXXXX*montant#)
 * 3. Client compose le code sur son téléphone → confirmé par PIN
 * 4. Opérateur envoie un webhook à /payments/webhook/orange
 * 5. API met à jour le statut du paiement → confirme la réservation
 *
 * Commission VIVRE : 12% prélevé sur chaque transaction.
 * supplier_amount = amount × 0.88 (versé au fournisseur)
 * platform_fee = amount × 0.12 (revenus VIVRE)
 */

import type { UUID, Timestamps } from "./common.js";
import type {
  PaymentMethod,
  PaymentStatus,
  PaymentBookingType,
  RefundStatus,
  DiscountType,
  PromoAppliesTo,
} from "./enums.js";

/* ============================================================
 * PAIEMENTS
 * ============================================================ */

/**
 * Transaction de paiement.
 * booking_type + booking_id permettent de retrouver la réservation associée.
 * provider_ref = référence de transaction chez l'opérateur (Orange, Moov, Stripe).
 */
export interface Payment extends Timestamps {
  id: UUID;
  user_id: UUID;
  amount: number;             /* FCFA */
  currency: string;           /* "XOF" (Franc CFA BCEAO) — toujours XOF */
  payment_method: PaymentMethod;
  provider_ref?: string;      /* Référence Orange/Moov/Stripe */
  status: PaymentStatus;
  booking_type: PaymentBookingType;
  booking_id: UUID;           /* ID de la réservation concernée */
  platform_fee: number;       /* FCFA — commission VIVRE (12%) */
  supplier_amount: number;    /* FCFA — montant reversé au fournisseur (88%) */
  paid_at?: string;
  failed_at?: string;
  failure_reason?: string;    /* Message d'erreur de l'opérateur */
}

/**
 * Demande de remboursement.
 * Les remboursements sont traités manuellement par l'admin en Phase 1
 * puis automatisés via les APIs Orange/Moov en Phase 2.
 */
export interface Refund extends Timestamps {
  id: UUID;
  payment_id: UUID;
  amount: number;       /* FCFA — peut être partiel */
  reason: string;
  status: RefundStatus;
  processed_by?: UUID;  /* Admin qui a traité le remboursement */
  processed_at?: string;
}

/* ============================================================
 * CODES PROMO
 * ============================================================ */

/**
 * Code promotionnel.
 * max_uses_per_user = 1 par défaut — un code ne peut être utilisé qu'une fois par compte.
 * applies_to = module concerné ("all" = toutes les réservations).
 */
export interface PromoCode extends Timestamps {
  id: UUID;
  code: string;           /* Ex: "VIVRE50", "BOBO2026" */
  discount_type: DiscountType;
  discount_value: number; /* FCFA si fixed_fcfa, % si percent (ex: 20 = 20%) */
  min_order_fcfa?: number;
  max_uses?: number;
  uses_count: number;
  max_uses_per_user: number;
  applies_to: PromoAppliesTo;
  supplier_id?: UUID;     /* Si défini → promo spécifique à un fournisseur */
  valid_from: string;     /* ISO 8601 */
  valid_until: string;
  is_active: boolean;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête POST /payments/initiate — début du paiement.
 */
export interface InitiatePaymentRequest {
  booking_type: PaymentBookingType;
  booking_id: UUID;
  payment_method: PaymentMethod;
  amount: number; /* FCFA — doit correspondre au total de la réservation */
}

/**
 * Réponse de POST /payments/initiate.
 * payment_url = lien Stripe Checkout (pour les paiements par carte).
 * ussd_code = code à composer pour Orange Money / Moov Money.
 * Pour Cash, aucun de ces deux champs n'est présent.
 */
export interface InitiatePaymentResponse {
  payment_id: UUID;
  payment_url?: string;  /* Stripe Checkout URL */
  ussd_code?: string;    /* Ex: "*144*1*3310XXXX*500#" — à afficher au client */
  status: PaymentStatus;
}

/**
 * Corps de la requête POST /payments/:id/refund-request.
 */
export interface RefundRequest {
  reason: string;
}

/**
 * Réponse d'une demande de remboursement.
 */
export interface RefundRequestResponse {
  refund_request: {
    id: UUID;
    status: RefundStatus;
    amount: number;       /* FCFA */
    expected_days: number; /* Délai estimé de remboursement en jours */
  };
}

/**
 * Corps des webhooks Orange Money et Moov Money.
 * La structure exacte varie selon l'opérateur — ce type est simplifié.
 * La vérification de signature est faite côté serveur avant le parsing.
 */
export interface MobileMoneyWebhookPayload {
  transaction_id: string;
  payment_ref: string;         /* Correspond à notre payment.provider_ref */
  status: "SUCCESS" | "FAILED" | "PENDING";
  amount: number;
  currency: string;
  timestamp: string;
}
