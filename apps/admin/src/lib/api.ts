/**
 * lib/api.ts — Client HTTP pour le dashboard admin VIVRE
 *
 * Même pattern que apps/supplier/src/lib/api.ts :
 *   - Inject Bearer token depuis Zustand (localStorage "vivre-admin-auth")
 *   - Refresh automatique sur 401
 *   - ApiError typée pour les erreurs API
 */

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("vivre-admin-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { skipAuth?: boolean }
): Promise<T> {
  const token = options?.skipAuth ? null : getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? "Erreur serveur",
      res.status,
      (data as { code?: string }).code
    );
  }

  return data as T;
}

export const apiClient = {
  get:    <T>(path: string) => request<T>("GET", path),
  post:   <T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }) => request<T>("POST", path, body, opts),
  patch:  <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
