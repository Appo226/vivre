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
 * Pattern singleton pour éviter les connexions multiples.
 */
export function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

  redisInstance = new Redis(redisUrl, {
    /*
     * Reconnexion automatique avec backoff exponentiel.
     * Sur un réseau instable (Burkina Faso), Redis peut être temporairement inaccessible.
     * retryStrategy évite un crash complet — l'API reste up mais le cache est indisponible.
     */
    retryStrategy: (times: number) => {
      if (times > 5) {
        /* Après 5 tentatives, abandonner pour ne pas bloquer indéfiniment */
        console.error("Redis : impossible de se connecter après 5 tentatives");
        return null; /* null = arrêter les retries */
      }
      /* Backoff exponentiel : 200ms, 400ms, 800ms, 1600ms, 3200ms */
      return Math.min(times * 200, 3000);
    },
    /* Timeout de connexion — évite de bloquer les requêtes si Redis est lent */
    connectTimeout: 5000,
    /* Préfixe sur toutes les clés — évite les collisions si Redis est partagé */
    keyPrefix: "vivre:",
    /* Désactiver les reconnexions sur le mode "subscriber" (non utilisé ici) */
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redisInstance.on("connect", () => {
    console.log("[Redis] Connexion établie");
  });

  redisInstance.on("error", (err: Error) => {
    /* Log l'erreur mais ne crash pas le serveur — Redis est optionnel en dev */
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
