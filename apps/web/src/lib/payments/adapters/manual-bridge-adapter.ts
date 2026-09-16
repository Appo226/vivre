/**
 * lib/payments/adapters/manual-bridge-adapter.ts — Pont manuel mobile money.
 *
 * N'EST PAS un vrai prestataire de paiement (PSP). Aucun système externe à appeler : l'argent
 * a déjà bougé (acheteur→organisateur, ou annonceur→VIVRE) directement en mobile money, hors
 * de l'app, et un humain (organisateur ou admin) atteste ce fait ici. Volontairement dépourvu
 * de initiate()/verify() — capabilities rend cela structurellement explicite, pour que
 * l'orchestrateur ne puisse jamais confondre ceci avec un vrai PSP automatisé.
 *
 * Parce que la confirmation est une action humaine synchrone unique, une PaymentAttempt créée
 * via ce pont naît déjà résolue (status "completed") — elle ne passe jamais par
 * "initiated"/"pending" et n'a donc jamais besoin de réconciliation.
 */

import type { PaymentAdapter, ManualConfirmationInput, PaymentVerificationResult } from "@/lib/payments/types";

export const ManualBridgeAdapter: PaymentAdapter = {
  kind: "manual_bridge",
  capabilities: {
    canInitiate: false,
    canVerify: false,
    requiresManualConfirmation: true,
    canPayout: false,
  },

  async confirmManually(_input: ManualConfirmationInput): Promise<PaymentVerificationResult> {
    return { status: "completed", paymentMethod: "manual_mobile_money", amountFcfa: null };
  },
};
