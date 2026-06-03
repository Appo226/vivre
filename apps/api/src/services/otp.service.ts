/**
 * services/otp.service.ts — Logique métier des codes OTP pour VIVRE
 *
 * Flow complet :
 * 1. saveOtp(phone, code) — stocke le code dans Redis (TTL 5min)
 * 2. checkRateLimit(phone) — vérifie que l'utilisateur n'a pas dépassé 3/heure
 * 3. verifyOtp(phone, code) — compare le code et le supprime si valide
 *
 * Pourquoi Redis et pas la base de données PostgreSQL ?
 * - Redis gère le TTL nativement (auto-expiry à 5 minutes)
 * - Les lookups OTP sont ultra-fréquents (chaque connexion) — Redis est 100x plus rapide que Postgres
 * - Les codes OTP sont éphémères — inutile de les persister longtemps
 *
 * Note : La table `otp_codes` Prisma existe pour l'audit et la conformité RGPD.
 * On y enregistre les tentatives (phone, purpose, used_at) sans le code lui-même.
 */

import {
  getRedis,
  otpKey,
  otpRateLimitKey,
  OTP_TTL_SECONDS,
  OTP_RATE_LIMIT_MAX,
  OTP_RATE_LIMIT_WINDOW,
} from "../plugins/redis.js";

/* ============================================================
 * RÉSULTATS TYPÉS
 * ============================================================ */

export type OtpVerifyResult =
  | { success: true }
  | { success: false; reason: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" };

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfter: number }; /* secondes avant de réessayer */

/* ============================================================
 * GESTION DU CODE OTP
 * ============================================================ */

/**
 * Stocke un code OTP dans Redis avec expiry de 5 minutes.
 * Écrase un éventuel code précédent (re-envoi = nouveau code).
 *
 * @param phone - Numéro E.164 (+226...)
 * @param code - Code OTP à 6 chiffres
 */
export async function saveOtp(phone: string, code: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("REDIS_UNAVAILABLE");
  await redis.setex(otpKey(phone), OTP_TTL_SECONDS, code);
}

/**
 * Vérifie un code OTP soumis par l'utilisateur.
 *
 * Comportement :
 * - Si le code correspond : supprime la clé Redis (usage unique) → success
 * - Si le code ne correspond pas → INVALID_CODE
 * - Si la clé n'existe pas (expiré ou jamais envoyé) → EXPIRED/NOT_FOUND
 *
 * Sécurité : comparaison de chaînes de caractères — pas d'injection possible.
 * Le code est stocké en clair dans Redis car il expire en 5 minutes (risque limité).
 *
 * @param phone - Numéro E.164 (+226...)
 * @param submittedCode - Code saisi par l'utilisateur
 */
export async function verifyOtp(
  phone: string,
  submittedCode: string
): Promise<OtpVerifyResult> {
  const redis = getRedis();
  if (!redis) return { success: false, reason: "EXPIRED" };
  const storedCode = await redis.get(otpKey(phone));

  if (storedCode === null) {
    /* La clé n'existe pas : soit le code a expiré (>5min), soit jamais envoyé */
    return { success: false, reason: "EXPIRED" };
  }

  if (storedCode !== submittedCode) {
    /* Code incorrect — on ne supprime pas la clé pour permettre une correction */
    return { success: false, reason: "INVALID_CODE" };
  }

  /*
   * Code correct — supprimer immédiatement la clé Redis.
   * Rend le code à usage unique : un attaquant ne peut pas le réutiliser.
   * Même si le réseau est lent, la suppression est atomique dans Redis.
   */
  await redis.del(otpKey(phone));
  return { success: true };
}

/* ============================================================
 * RATE LIMITING OTP
 * Protège contre le spam SMS (coût) et le brute-force
 * ============================================================ */

/**
 * Vérifie si le numéro peut recevoir un nouvel OTP (max 3/heure).
 * Incrémente le compteur si autorisé.
 *
 * Implémentation : compteur Redis avec TTL fenêtre glissante.
 * INCR est atomique dans Redis — pas de race condition.
 *
 * @param phone - Numéro E.164 (+226...)
 * @returns allowed=true avec les envois restants, ou allowed=false avec retryAfter
 */
export async function checkAndIncrementRateLimit(
  phone: string
): Promise<RateLimitResult> {
  const redis = getRedis();
  /* Redis indisponible — on laisse passer sans rate limiting */
  if (!redis) return { allowed: true, remaining: OTP_RATE_LIMIT_MAX - 1 };
  const key = otpRateLimitKey(phone);

  /*
   * INCR crée la clé si elle n'existe pas (valeur initiale 0 → 1).
   * Atomique : même sous charge, deux requêtes simultanées ne peuvent pas
   * toutes les deux lire 0 et écrire 1.
   */
  const count = await redis.incr(key);

  /* Première incrémentation : poser le TTL de la fenêtre (1 heure) */
  if (count === 1) {
    await redis.expire(key, OTP_RATE_LIMIT_WINDOW);
  }

  if (count > OTP_RATE_LIMIT_MAX) {
    /*
     * Limite atteinte — récupérer le TTL restant pour indiquer quand réessayer.
     * TTL retourne -1 si pas de TTL (ne devrait pas arriver), -2 si clé inexistante.
     */
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: Math.max(ttl, 0) };
  }

  return { allowed: true, remaining: OTP_RATE_LIMIT_MAX - count };
}
