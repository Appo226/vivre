/**
 * lib/payments/registry.ts — Registre des adapters de paiement disponibles.
 */

import type { PaymentAdapter, PaymentProviderKind } from "@/lib/payments/types";
import { CinetPayAdapter, isCinetPayAvailable } from "@/lib/payments/adapters/cinetpay-adapter";
import { ManualBridgeAdapter } from "@/lib/payments/adapters/manual-bridge-adapter";

const ADAPTERS: Record<PaymentProviderKind, PaymentAdapter> = {
  cinetpay: CinetPayAdapter,
  manual_bridge: ManualBridgeAdapter,
};

export function getAdapter(kind: PaymentProviderKind): PaymentAdapter {
  return ADAPTERS[kind];
}

/** manual_bridge est toujours "disponible" — c'est un processus humain, pas un interrupteur
 *  de configuration. */
export function isProviderAvailable(kind: PaymentProviderKind): boolean {
  if (kind === "cinetpay") return isCinetPayAvailable();
  return true;
}
