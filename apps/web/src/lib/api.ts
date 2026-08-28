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

/**
 * Rafraîchit l'access token via le refresh token stocké (valide 30 jours). Partagé entre
 * requêtes concurrentes qui expirent en même temps — sans ce cache, 5 requêtes en 401
 * simultanées déclencheraient 5 appels /auth/refresh au lieu d'un seul.
 *
 * NOTE HISTORIQUE : le commentaire d'en-tête de ce fichier décrivait ce comportement comme
 * déjà implémenté ("refresh automatique du token si 401") mais rien ne l'appelait jamais —
 * le refresh_token était stocké puis jamais utilisé. Résultat concret : après expiration de
 * l'access token (1h), chaque appel API échouait en 401 jusqu'à ce que l'utilisateur se
 * reconnecte manuellement, alors qu'un refresh token valide 30 jours dormait dans le store.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken, user } = useAuthStore.getState();
    if (!refreshToken || !user) return null;

    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      if (!response.ok) return null;

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      useAuthStore.getState().setAuth({ accessToken: data.access_token, refreshToken: data.refresh_token, user });
      /* Le middleware lit ce cookie séparément du store Zustand — voir auth/page.tsx */
      document.cookie = `vivre_auth_token=${data.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      return data.access_token;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

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
  options?: { skipAuth?: boolean; isRetry?: boolean }
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
    /*
     * 401 sur une route authentifiée (jamais sur skipAuth : login/register renvoient
     * volontairement 401 pour un mauvais mot de passe, ce n'est pas un token expiré) —
     * tenter un refresh silencieux une seule fois avant d'abandonner. isRetry empêche une
     * boucle si le refresh lui-même échoue à répétition.
     */
    if (response.status === 401 && accessToken && !options?.skipAuth && !options?.isRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return request<T>(method, path, body, { ...options, isRetry: true });
      }
      /* Refresh token lui-même invalide/expiré — session vraiment terminée, pas la peine
       * de laisser l'app dans un état à moitié connecté. La prochaine navigation protégée
       * sera redirigée vers /auth par le middleware (plus de cookie vivre_auth_token). */
      useAuthStore.getState().logout();
      document.cookie = "vivre_auth_token=; path=/; max-age=0; SameSite=Lax";
    }

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
    username: string | null;
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
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  is_verified: boolean;
  roles: string[];
  created_at: string;
}
