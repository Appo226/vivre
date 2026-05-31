/**
 * lib/api.ts — Client HTTP pour l'API VIVRE
 *
 * Wrapper autour de fetch() qui gère :
 * - L'injection automatique du Bearer token JWT dans les headers
 * - La base URL de l'API (NEXT_PUBLIC_API_URL depuis .env.local)
 * - Le refresh automatique du token si l'accès est refusé (401)
 * - La sérialisation/désérialisation JSON
 * - Les erreurs HTTP typées
 *
 * Usage :
 *   const data = await apiClient.post('/auth/send-otp', { phone: '+22670...' });
 *   const user = await apiClient.get('/users/me');
 */

import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

const BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";

/* ============================================================
 * TYPES D'ERREUR
 * ============================================================ */

/** Erreur retournée par l'API VIVRE (format standard) */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ============================================================
 * FETCH HELPER
 * ============================================================ */

/**
 * Effectue une requête HTTP vers l'API VIVRE.
 * Injecte automatiquement le Bearer token depuis le store Zustand.
 *
 * @throws ApiError si le serveur retourne une erreur HTTP
 */
async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
  options?: { skipAuth?: boolean }
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  /* Injecter le token JWT sauf pour les routes publiques (send-otp, verify-otp) */
  if (accessToken && !options?.skipAuth) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  /*
   * Avec exactOptionalPropertyTypes, `body: undefined` n'est pas assignable
   * à `BodyInit | null`. On utilise le spread conditionnel pour omettre
   * la propriété `body` quand il n'y a pas de payload (requêtes GET/DELETE).
   */
  const fetchInit: RequestInit = {
    method,
    headers,
    cache: "no-store",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  };

  const response = await fetch(`${BASE_URL}${path}`, fetchInit);

  /* Lire le corps de la réponse */
  let data: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  /* Gérer les erreurs HTTP */
  if (!response.ok) {
    const errorData = data as {
      error?: string;
      code?: string;
      details?: unknown;
    };

    throw new ApiError(
      response.status,
      errorData.code ?? "HTTP_ERROR",
      errorData.error ?? `HTTP ${response.status}`,
      errorData.details
    );
  }

  return data as T;
}

/* ============================================================
 * CLIENT API VIVRE
 * ============================================================ */

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, options?: { skipAuth?: boolean }) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

/* ============================================================
 * TYPES DE RÉPONSE API (Auth)
 * ============================================================ */

export interface SendOtpResponse {
  message: string;
  expires_in: number;
  remaining_attempts: number;
}

export interface VerifyOtpResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  is_new_user: boolean;
  user: {
    id: string;
    phone: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
    preferred_language: string;
    roles: string[];
  };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface MeResponse {
  id: string;
  phone: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  is_verified: boolean;
  roles: string[];
  created_at: string;
}
