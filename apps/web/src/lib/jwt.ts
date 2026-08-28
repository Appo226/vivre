/**
 * lib/jwt.ts — Émission et vérification des JWT de session VIVRE
 *
 * Tokens stateless (pas de Redis) : l'access token porte l'identité + les rôles,
 * le refresh token ne porte que le user_id et un flag "refresh" pour éviter
 * qu'un access token volé serve à générer de nouveaux tokens.
 */

import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET manquant — voir .env.local");
}
const secretKey = new TextEncoder().encode(JWT_SECRET);

const ACCESS_EXPIRES_IN = process.env["JWT_EXPIRES_IN"] ?? "1h";
const REFRESH_EXPIRES_IN = process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d";

export interface AccessTokenClaims {
  sub: string; // user_id
  phone: string;
  roles: string[];
}

export interface RefreshTokenClaims {
  sub: string; // user_id
  type: "refresh";
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ phone: claims.phone, roles: claims.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES_IN)
    .sign(secretKey);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRES_IN)
    .sign(secretKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey);
  return {
    sub: payload["sub"] as string,
    phone: payload["phone"] as string,
    roles: (payload["roles"] as string[]) ?? [],
  };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey);
  if (payload["type"] !== "refresh") {
    throw new Error("Ce token n'est pas un refresh token");
  }
  return { sub: payload["sub"] as string, type: "refresh" };
}

/** Extrait le Bearer token du header Authorization, ou null. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}
