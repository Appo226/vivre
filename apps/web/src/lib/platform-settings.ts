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

/**
 * Commission organisateur effective pour un NOUVEL événement — 0 si la période gratuite est
 * active, sinon réduite par la remise propre à ce compte (fee_discount_percent, 0 par défaut
 * pour tout le monde — voir User.fee_discount_percent, réglable par admin pour un bêta-testeur
 * ou une promo, sans devoir couper les frais pour toute la plateforme).
 */
export function effectiveOrganizerFeePercent(
  settings: { free_period_enabled: boolean; organizer_fee_percent: number },
  organizerDiscountPercent = 0
): number {
  if (settings.free_period_enabled) return 0;
  return settings.organizer_fee_percent * (1 - organizerDiscountPercent / 100);
}

export function effectiveBuyerFee(
  settings: { free_period_enabled: boolean; buyer_fee_percent: number; buyer_fee_flat_fcfa: number },
  subtotalFcfa: number
): number {
  if (settings.free_period_enabled) return 0;
  return Math.round(subtotalFcfa * (settings.buyer_fee_percent / 100)) + settings.buyer_fee_flat_fcfa;
}

/** Frais de mise en ligne d'un événement — même montant gratuit ou payant, voir events/[id]/submit. */
export function effectiveListingFeeFcfa(
  settings: { free_period_enabled: boolean; event_listing_fee_fcfa: number },
  organizerDiscountPercent = 0
): number {
  if (settings.free_period_enabled) return 0;
  return Math.round(settings.event_listing_fee_fcfa * (1 - organizerDiscountPercent / 100));
}

/** Tarif pub par jour selon le type de média choisi (photo ou vidéo) pour une pub liée à un événement. */
export function effectiveAdPricePerDayFcfa(
  settings: { free_period_enabled: boolean; ad_price_photo_fcfa_per_day: number; ad_price_video_fcfa_per_day: number },
  mediaType: "photo" | "video",
  organizerDiscountPercent = 0
): number {
  if (settings.free_period_enabled) return 0;
  const base = mediaType === "video" ? settings.ad_price_video_fcfa_per_day : settings.ad_price_photo_fcfa_per_day;
  return Math.round(base * (1 - organizerDiscountPercent / 100));
}
