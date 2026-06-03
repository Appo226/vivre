/**
 * services/jwt.service.ts — Gestion des tokens JWT pour VIVRE
 *
 * VIVRE utilise deux types de tokens :
 *
 * 1. access_token (court) : signé avec JWT_SECRET, durée 7 jours.
 *    Inclus dans chaque requête API (Authorization: Bearer <token>).
 *    Contient : user_id, phone, roles (évite un aller-retour DB à chaque requête).
 *
 * 2. refresh_token (long) : UUID aléatoire, durée 30 jours.
 *    Stocké dans Redis avec le user_id (révocable en cas de vol).
 *    Permet d'obtenir un nouveau access_token sans se reconnecter.
 *
 * Pourquoi des refresh tokens ?
 * Si un access_token est volé, il est valide jusqu'à son expiry (7 jours).
 * Le refresh_token permet de déconnecter l'utilisateur immédiatement en cas de
 * compromission (logout = suppression du refresh_token dans Redis).
 */

import { nanoid } from "nanoid";
import { getRedis, refreshTokenKey, REFRESH_TOKEN_TTL_SECONDS } from "../plugins/redis.js";

/* ============================================================
 * TYPES
 * ============================================================ */

/** Payload signé dans le JWT access_token */
export interface JwtPayload {
  sub: string;       /* user_id (UUID) — sujet du token */
  phone: string;     /* Numéro E.164 (+226...) */
  roles: string[];   /* ["customer", "supplier", ...] */
  iat?: number;      /* Issued at (ajouté automatiquement par JWT) */
  exp?: number;      /* Expiry (ajouté automatiquement par JWT) */
}

/** Paire de tokens retournée après connexion réussie */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_at: string; /* ISO 8601 — date d'expiry de l'access_token */
}

/* ============================================================
 * GÉNÉRATION DES TOKENS
 * ============================================================ */

/**
 * Signe un access_token JWT avec le payload utilisateur.
 * Utilise @fastify/jwt via app.jwt.sign() — nécessite l'instance Fastify.
 *
 * Appelé par : verify-otp.ts, refresh.ts
 *
 * @param jwtSign - Fonction app.jwt.sign de l'instance Fastify
 * @param payload - Données à encoder dans le token
 */
export function signAccessToken(
  jwtSign: (payload: JwtPayload) => string,
  payload: JwtPayload
): string {
  return jwtSign(payload);
}

/**
 * Génère un refresh token aléatoire et le stocke dans Redis.
 *
 * Le token est un UUID nanoid (21 caractères, URL-safe, entropie 126 bits).
 * Il est stocké sous la clé Redis `vivre:rt:{userId}:{tokenId}` avec TTL 30 jours.
 * La présence de la clé Redis = token valide. Suppression = révocation.
 *
 * @param userId - UUID de l'utilisateur
 * @returns refresh_token à retourner au client
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const tokenId = nanoid(32);

  const redis = getRedis();
  if (redis) {
    await redis.setex(
      refreshTokenKey(userId, tokenId),
      REFRESH_TOKEN_TTL_SECONDS,
      userId
    );
  } else {
    /* Redis indisponible — mode stateless, pas de révocation possible */
    console.warn("[JWT] Redis indisponible — refresh token non persisté (mode stateless)");
  }

  return tokenId;
}

/**
 * Vérifie qu'un refresh token est valide (présent dans Redis) et retourne le userId.
 * Si Redis est indisponible, accepte le token (mode stateless dégradé).
 */
export async function validateRefreshToken(
  userId: string,
  tokenId: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    /* Redis indisponible — token considéré valide (mode stateless) */
    return true;
  }
  const storedUserId = await redis.get(refreshTokenKey(userId, tokenId));
  return storedUserId === userId;
}

/**
 * Révoque un refresh token en le supprimant de Redis.
 * No-op si Redis est indisponible.
 */
export async function revokeRefreshToken(
  userId: string,
  tokenId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(refreshTokenKey(userId, tokenId));
}

/* ============================================================
 * HELPERS DE DATE
 * ============================================================ */

/**
 * Calcule la date d'expiry de l'access_token en ISO 8601.
 * Utilisé dans la réponse pour informer le client quand refresher.
 *
 * @param expiresIn - ex: "7d", "24h", "1h"
 */
export function getTokenExpiresAt(expiresIn: string = "7d"): string {
  const units: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
  };

  /* Parser "7d" → { value: 7, unit: 'd' } */
  const match = expiresIn.match(/^(\d+)([dhm])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [, value, unit] = match;
  const ms = parseInt(value!, 10) * (units[unit!] ?? 0);
  return new Date(Date.now() + ms).toISOString();
}
