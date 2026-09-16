/**
 * lib/payments/adapters/cinetpay-adapter.ts — Adapter CinetPay pour l'orchestrateur.
 *
 * Enveloppe fine autour de lib/cinetpay.ts (INCHANGÉ — voir Stage 1, on ne supprime ni
 * n'altère jamais ce fichier). Préserve la règle "ne jamais faire confiance au seul payload
 * webhook, toujours rappeler l'endpoint de vérification du provider" en n'exposant ce
 * comportement que via verify(). verify() peut LEVER une exception (timeout/réseau/panne) —
 * elle n'est jamais catchée ici ni transformée en "pending" ; l'appelant (orchestrator.ts)
 * doit la traiter distinctement d'une réponse "pending" authentique.
 */

import { cinetpayConfigured, initiateCinetPayPayment, verifyCinetPayPayment } from "@/lib/cinetpay";
import type {
  PaymentAdapter,
  PaymentInitiationRequest,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from "@/lib/payments/types";

export const CinetPayAdapter: PaymentAdapter = {
  kind: "cinetpay",
  capabilities: {
    canInitiate: true,
    canVerify: true,
    requiresManualConfirmation: false,
    canPayout: false,
  },

  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    const result = await initiateCinetPayPayment({
      // Un id de transaction CinetPay PAR TENTATIVE, pas par Payment — c'est ce qui corrige
      // le bug historique où /api/payments/initiate réutilisait le même id à chaque retry.
      transactionId: request.paymentAttemptId,
      amountFcfa: request.amountFcfa,
      description: request.description,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      ...(request.customerEmail && { customerEmail: request.customerEmail }),
      returnUrl: request.returnUrl,
      notifyUrl: request.notifyUrl,
    });
    return { redirectUrl: result.paymentUrl, providerRef: result.paymentToken };
  },

  async verify(providerTransactionId: string): Promise<PaymentVerificationResult> {
    const v = await verifyCinetPayPayment(providerTransactionId);
    return { status: v.status, paymentMethod: v.paymentMethod, amountFcfa: v.amount };
  },
};

export function isCinetPayAvailable(): boolean {
  return cinetpayConfigured();
}
