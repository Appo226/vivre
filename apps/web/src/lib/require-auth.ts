/**
 * lib/require-auth.ts — Helper partagé pour protéger les Route Handlers.
 * Usage : const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;
 */

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyAccessToken, type AccessTokenClaims } from "@/lib/jwt";
import { apiError } from "@/lib/api-response";

export async function requireAuth(request: NextRequest): Promise<AccessTokenClaims | NextResponse> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return apiError(401, "UNAUTHENTICATED", "Authentification requise");
  }
  try {
    return await verifyAccessToken(token);
  } catch {
    return apiError(401, "TOKEN_INVALID", "Session expirée. Reconnectez-vous.");
  }
}

/**
 * optionalAuth — pour une route PUBLIQUE (ex: GET /events) qui veut adapter sa réponse
 * SI l'appelant est connecté (ex: is_favorited), sans jamais l'exiger. Ne renvoie jamais de
 * NextResponse d'erreur : un token absent ou invalide redonne simplement null, la route
 * continue son cours normal pour un visiteur anonyme.
 */
export async function optionalAuth(request: NextRequest): Promise<AccessTokenClaims | null> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}
