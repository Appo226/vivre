/**
 * lib/platform-settings.ts — Paramètres globaux de la plateforme (frais, interrupteurs).
 * Ligne singleton "default" — modifiable depuis le dashboard admin sans redéploiement.
 */

import { prisma } from "@vivre/database";

export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

/** Commission organisateur effective pour un NOUVEL événement — 0 si la période gratuite est active. */
export function effectiveOrganizerFeePercent(settings: { free_period_enabled: boolean; organizer_fee_percent: number }): number {
  return settings.free_period_enabled ? 0 : settings.organizer_fee_percent;
}

export function effectiveBuyerFee(
  settings: { free_period_enabled: boolean; buyer_fee_percent: number; buyer_fee_flat_fcfa: number },
  subtotalFcfa: number
): number {
  if (settings.free_period_enabled) return 0;
  return Math.round(subtotalFcfa * (settings.buyer_fee_percent / 100)) + settings.buyer_fee_flat_fcfa;
}
