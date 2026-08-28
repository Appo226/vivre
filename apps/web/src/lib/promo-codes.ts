/**
 * lib/promo-codes.ts — Validation partagée des codes promo événements.
 * Utilisée par /api/events/[id]/promo-codes/validate (lecture seule, aperçu) et par la
 * création de réservation (avec verrouillage — voir validatePromoCodeForUpdate).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { getPlatformSettings } from "@/lib/platform-settings";

/** Client Prisma normal OU client de transaction (tx). */
type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export interface PromoValidationResult {
  valid: boolean;
  error?: string;
  discountFcfa?: number;
  promoCodeId?: string;
}

/** Aperçu en lecture seule — utilisé par l'écran de checkout avant de soumettre la réservation. */
export async function validatePromoCode(
  code: string,
  eventId: string,
  userId: string,
  subtotalFcfa: number
): Promise<PromoValidationResult> {
  return validatePromoCodeInternal(prisma, code, eventId, userId, subtotalFcfa, false);
}

/**
 * Version utilisée PENDANT la création de la réservation, à l'intérieur d'une transaction.
 * Verrouille la ligne promo_codes (SELECT ... FOR UPDATE) avant de relire uses_count — sans
 * ça, deux achats simultanés avec le même code proche de sa limite pourraient tous les deux
 * passer la vérification et dépasser max_uses (même classe de bug que la survente de billets).
 */
export async function validatePromoCodeForUpdate(
  tx: PrismaOrTx,
  code: string,
  eventId: string,
  userId: string,
  subtotalFcfa: number
): Promise<PromoValidationResult> {
  return validatePromoCodeInternal(tx, code, eventId, userId, subtotalFcfa, true);
}

async function validatePromoCodeInternal(
  client: PrismaOrTx,
  code: string,
  eventId: string,
  userId: string,
  subtotalFcfa: number,
  lock: boolean
): Promise<PromoValidationResult> {
  const settings = await getPlatformSettings();
  if (!settings.discounts_enabled) {
    return { valid: false, error: "Les codes promo sont temporairement désactivés" };
  }

  const normalizedCode = code.toUpperCase();

  if (lock) {
    // Verrouille la ligne — bloque toute autre transaction qui tenterait de lire/modifier
    // ce même code promo jusqu'à ce que celle-ci commit ou annule.
    await client.$executeRaw`SELECT id FROM promo_codes WHERE code = ${normalizedCode} FOR UPDATE`;
  }

  const promo = await client.promoCode.findUnique({ where: { code: normalizedCode } });
  if (!promo || !promo.is_active) {
    return { valid: false, error: "Code promo invalide" };
  }
  // event_id null = code plateforme valable partout ; sinon doit correspondre à cet événement
  if (promo.event_id && promo.event_id !== eventId) {
    return { valid: false, error: "Ce code n'est pas valable pour cet événement" };
  }
  const now = new Date();
  if (now < promo.valid_from || now > promo.valid_until) {
    return { valid: false, error: "Ce code promo n'est plus valable" };
  }
  if (promo.min_order_fcfa && subtotalFcfa < promo.min_order_fcfa) {
    return { valid: false, error: `Commande minimum de ${promo.min_order_fcfa} FCFA requise pour ce code` };
  }
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
    return { valid: false, error: "Ce code promo a atteint sa limite d'utilisation" };
  }

  const userUses = await client.eventBooking.count({
    where: { user_id: userId, promo_code_id: promo.id, status: { not: "cancelled" } },
  });
  if (userUses >= promo.max_uses_per_user) {
    return { valid: false, error: "Vous avez déjà utilisé ce code" };
  }

  const discountFcfa =
    promo.discount_type === "percent"
      ? Math.round(subtotalFcfa * (promo.discount_value / 100))
      : Math.min(promo.discount_value, subtotalFcfa);

  return { valid: true, discountFcfa, promoCodeId: promo.id };
}
