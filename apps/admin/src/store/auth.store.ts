/**
 * store/auth.store.ts — État d'authentification de l'admin VIVRE
 *
 * Persiste dans localStorage sous "vivre-admin-auth".
 * La clé "vivre_admin_token" est aussi stockée en cookie pour le middleware.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AdminUser {
  id:         string;
  phone:      string;
  first_name: string | null;
  last_name:  string | null;
  roles:      string[];
}

interface AuthState {
  user:         AdminUser | null;
  accessToken:  string | null;
  refreshToken: string | null;
  setAuth: (payload: { accessToken: string; refreshToken: string; user: AdminUser }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:         null,
      accessToken:  null,
      refreshToken: null,
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: "vivre-admin-auth",
      partialize: (state) => ({
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
        user:         state.user,
      }),
    }
  )
);
