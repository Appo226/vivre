/**
 * store/auth.store.ts — Store Zustand pour l'authentification VIVRE
 *
 * Gère l'état global de la session utilisateur côté client :
 * - access_token + refresh_token
 * - Profil utilisateur (id, phone, prénom, roles)
 * - Persistance dans localStorage (survit au refresh de page)
 *
 * Pourquoi Zustand et pas Context ?
 * Context provoque des re-renders en cascade sur tout l'arbre de composants.
 * Zustand est plus performant : seuls les composants abonnés à un champ précis
 * re-rendent quand ce champ change (ex: isAuthenticated change → seul le header re-rend).
 *
 * Persistance localStorage :
 * L'access_token est stocké en localStorage pour survivre au refresh de page.
 * En production, utiliser httpOnly cookies pour plus de sécurité contre les XSS.
 * Pour MVP, localStorage est acceptable (pas de données ultra-sensibles dans le token).
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ============================================================
 * TYPES
 * ============================================================ */

export interface AuthUser {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: string;
  roles: string[];
}

interface AuthState {
  /* Données de session */
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;

  /* Actions */
  setAuth: (params: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;

  /* Helpers dérivés */
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
}

/* ============================================================
 * STORE
 * ============================================================ */

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      /* --- État initial --- */
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      /* --- Connexion réussie : stocker les tokens et le profil --- */
      setAuth: ({ accessToken, refreshToken, user }) => {
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
        });
      },

      /* --- Mise à jour du profil seul (PUT /users/me) --- */
      setUser: (user) => {
        set({ user });
      },

      /* --- Déconnexion : vider tout le store --- */
      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      /* --- Vérifie si l'utilisateur a un rôle donné --- */
      hasRole: (role: string) => {
        const { user } = get();
        return user?.roles?.includes(role) ?? false;
      },
    }),
    {
      name: "vivre-auth",          /* Clé localStorage */
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : undefined as never
      ),
      /*
       * Persister uniquement les tokens et le user — pas les helpers (fonctions).
       * `isAuthenticated` est recalculé depuis accessToken à l'hydratation.
       */
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.accessToken !== null,
      }),
    }
  )
);
