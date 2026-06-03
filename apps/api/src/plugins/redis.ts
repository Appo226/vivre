/**
 * plugins/redis.ts — Client Redis singleton pour l'API VIVRE
 *
 * Redis est utilisé pour :
 * - Stocker les codes OTP (TTL 5 minutes, auto-expiry)
 * - Stocker les refresh tokens (TTL 30 jours, révocables)
 * - Rate limiting des envois OTP par numéro de téléphone
 * - Cache API en production (ex: liste des villes, services publics)
 *
 * Pourquoi un singleton ? En développement avec tsx --watch, le module
 * est re-évalué à chaque changement. Sans singleton, on créerait
 * une connexion Redis par hot-reload, saturant le pool.
 */

import Redis from "ioredis";

/* ============================================================
 * CONNEXION REDIS
 * ============================================================ */

let redisInstance: Redis | null = null;

/**
 * Retourne le client Redis, en le créant si nécessaire.
 * Retourne null si Redis est définitivement inaccessible.
 */
export function getRedis(): Redis | null {
  if (redisInstance && redisInstance.status !== "end") return redisInstance;

  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

  redisInstance = new Redis(redisUrl, {
    retryStrategy: (times: number) => {
      if (times > 5) {
        console.error("[Redis] Abandon après 5 tentatives — fonctionnement dégradé");
        /* Reset pour permettre une reconnexion lors de la prochaine requête */
        redisInstance = null;
        return null;
      }
      return Math.min(times * 200, 3000);
    },
    connectTimeout: 5000,
    keyPrefix: "vivre:",
    enableReadyCheck: true,
    /* lazyConnect évite un crash immédiat si Redis n'est pas encore prêt */
    lazyConnect: true,
  });

  void redisInstance.connect().catch(() => {
    /* Erreur de connexion initiale — ignorée, retryStrategy prend le relai */
  });

  redisInstance.on("connect", () => {
    console.log("[Redis] Connexion établie");
  });

  redisInstance.on("error", (err: Error) => {
    console.error("[Redis] Erreur :", err.message);
  });

  return redisInstance;
}

/* ============================================================
 * HELPERS OTP
 * Clés Redis pour les codes OTP et le rate limiting
 * ============================================================ */

/** Clé Redis pour le code OTP d'un numéro de téléphone */
export const otpKey = (phone: string): string => `otp:${phone}`;

/** Clé Redis pour le compteur de rate limit OTP (3/heure par numéro) */
export const otpRateLimitKey = (phone: string): string => `otp_rl:${phone}`;

/** Clé Redis pour un refresh token (stocké pour permettre la révocation) */
export const refreshTokenKey = (userId: string, tokenId: string): string =>
  `rt:${userId}:${tokenId}`;

/** TTL en secondes pour les codes OTP (5 minutes) */
export const OTP_TTL_SECONDS = 300;

/** TTL en secondes pour les refresh tokens (30 jours) */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Nombre max d'envois OTP par heure par numéro */
export const OTP_RATE_LIMIT_MAX = 3;

/** Fenêtre de rate limit OTP en secondes (1 heure) */
export const OTP_RATE_LIMIT_WINDOW = 60 * 60;
