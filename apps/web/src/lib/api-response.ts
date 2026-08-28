/**
 * lib/api-response.ts — Format de réponse d'erreur standard des Route Handlers.
 * Doit correspondre à ce que `apiClient` (src/lib/api.ts) attend : { error, code, details }.
 */

import { NextResponse } from "next/server";

export function apiError(
  status: number,
  code: string,
  error: string,
  details?: unknown
): NextResponse {
  return NextResponse.json({ error, code, ...(details !== undefined && { details }) }, { status });
}
