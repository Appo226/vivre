/**
 * lib/payments/types.ts — Contrat d'adapter de paiement + métadonnées de capacités.
 *
 * Chaque méthode de PaymentAdapter est OPTIONNELLE — un adapter n'implémente que ce que ses
 * `capabilities` déclarent supporter. L'orchestrateur (orchestrator.ts) vérifie `capabilities`
 * AVANT d'appeler une méthode et lève AdapterCapabilityError (erreur de programmation, jamais
 * montrée à l'utilisateur) si une route tente d'appeler une méthode que l'adapter ne déclare
 * pas. C'est ce mécanisme — pas un commentaire — qui empêche ManualBridgeAdapter (aucun vrai
 * PSP derrière) d'être confondu avec un adapter automatisé comme CinetPayAdapter.
 */

import type { PaymentAttemptStatus, PaymentProviderKind } from "@prisma/client";

export interface ProviderCapabilities {
  /** Peut rediriger/collecter automatiquement (page hébergée, push USSD) ? */
  canInitiate: boolean;
  /** Peut être interrogé "que s'est-il vraiment passé" via l'API propre du provider ? */
  canVerify: boolean;
  /** Résoudre un paiement nécessite-t-il qu'un humain (organisateur/admin) l'atteste ? */
  requiresManualConfirmation: boolean;
  /** Peut pousser de l'argent VERS l'extérieur de façon programmatique ? Aucun adapter ne le
   *  peut en Stage 1 — réservé à la future méthode payout() de PISPIAdapter. */
  canPayout: boolean;
}

export interface PaymentInitiationRequest {
  paymentAttemptId: string; // sert d'id de transaction chez le provider quand applicable
  amountFcfa: number;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface PaymentInitiationResult {
  redirectUrl?: string; // présent seulement si capabilities.canInitiate
  providerRef?: string; // référence opaque du provider, stockée sur PaymentAttempt.provider_ref
  raw?: unknown; // stocké sur PaymentAttempt.raw_provider_response pour audit
}

/**
 * status "completed"/"failed" sont AUTHENTIQUES — le provider a donné une réponse définitive.
 * "pending" signifie "demandé, pas de réponse définitive encore" (toujours réellement en cours
 * côté provider). Un appel verify() qui lève lui-même une exception (timeout/réseau/panne)
 * N'EST PAS représenté ici — l'appelant le catch séparément et ne doit JAMAIS le traiter comme
 * "pending" ; voir la boucle de réconciliation dans orchestrator.ts.
 */
export interface PaymentVerificationResult {
  status: "completed" | "failed" | "pending";
  paymentMethod: string | null;
  amountFcfa: number | null;
  raw?: unknown;
}

export interface ManualConfirmationInput {
  referenceNote: string;
  confirmedByUserId: string;
}

export interface PaymentAdapter {
  readonly kind: PaymentProviderKind;
  readonly capabilities: ProviderCapabilities;

  initiate?(request: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  verify?(providerTransactionId: string): Promise<PaymentVerificationResult>;
  confirmManually?(input: ManualConfirmationInput): Promise<PaymentVerificationResult>;

  // --- Délibérément absent en Stage 1 — emplacement réservé pour le futur PISPIAdapter ---
  // payIn?(request: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  // payout?(request: PayoutRequest): Promise<PayoutResult>;
}

export class AdapterCapabilityError extends Error {
  constructor(kind: PaymentProviderKind, method: string) {
    super(`L'adapter "${kind}" ne supporte pas ${method}() — vérifier capabilities avant d'appeler`);
    this.name = "AdapterCapabilityError";
  }
}

export type { PaymentAttemptStatus, PaymentProviderKind };
