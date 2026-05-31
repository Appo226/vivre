/**
 * lib/api.ts — Client HTTP pour le dashboard fournisseur VIVRE
 *
 * Même pattern que apps/web/src/lib/api.ts :
 * - Injection automatique du Bearer token depuis le store Zustand
 * - Refresh automatique du token si 401
 * - Classe ApiError pour la gestion d'erreurs typée
 *
 * Toutes les routes de l'API fournisseur sont préfixées /v1.
 */

import { useAuthStore } from "@/store/auth.store";

const BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { skipAuth?: boolean }
): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (accessToken && !options?.skipAuth) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  /* Refresh automatique si token expiré */
  if (response.status === 401 && accessToken) {
    const { refreshToken, setAuth, logout } = useAuthStore.getState();
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json() as { access_token: string; refresh_token: string };
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          setAuth({ accessToken: data.access_token, refreshToken: data.refresh_token, user: currentUser });
        }
        /* Rejouer la requête originale avec le nouveau token */
        const retry = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: { ...headers, Authorization: `Bearer ${data.access_token}` },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (retry.ok) return retry.json() as Promise<T>;
      }
    }
    logout();
    throw new ApiError(401, "Session expirée — veuillez vous reconnecter");
  }

  const contentType = response.headers.get("content-type");
  const data = contentType?.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    const err = data as { error?: string; code?: string };
    throw new ApiError(response.status, err.error ?? "Erreur inconnue", err.code);
  }

  return data as T;
}

export const apiClient = {
  get:    <T>(path: string) => request<T>("GET", path),
  post:   <T>(path: string, body?: unknown, options?: { skipAuth?: boolean }) =>
            request<T>("POST", path, body, options),
  put:    <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch:  <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
