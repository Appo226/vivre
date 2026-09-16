/**
 * tests/integration/helpers/auth.ts — Jetons d'accès de test + construction de NextRequest.
 */

import { NextRequest } from "next/server";
import { signAccessToken } from "@/lib/jwt";

export async function mintTestToken(userId: string, phone: string, roles: string[] = ["customer"]): Promise<string> {
  return signAccessToken({ sub: userId, phone, roles });
}

export function makeRequest(
  url: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json", ...options.headers });
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}
