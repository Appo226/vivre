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
