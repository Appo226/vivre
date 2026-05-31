/**
 * store/auth.store.ts — Store d'authentification du dashboard fournisseur
 *
 * Persiste les tokens JWT et le profil utilisateur dans localStorage.
 * Même structure que le store du web app — les tokens sont interchangeables
 * car c'est la même API.
 *
 * Champs spécifiques au fournisseur :
 *   supplierType : "restaurant" | "property" | null
 *   restaurantId : UUID du restaurant géré (si supplier restaurant)
 *   propertyId   : UUID de la propriété gérée (si supplier property)
 * Ces champs sont chargés après login depuis GET /users/me.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SupplierUser {
  id:           string;
  phone:        string;
  first_name:   string | null;
  last_name:    string | null;
  roles:        string[];
  /* Infos fournisseur — chargées depuis /restaurants/mine ou /properties/mine */
  supplierType: "restaurant" | "property" | "both" | null;
  restaurantId: string | null;
  propertyId:   string | null;
}

interface AuthState {
  accessToken:     string | null;
  refreshToken:    string | null;
  user:            SupplierUser | null;
  isAuthenticated: boolean;
  setAuth: (params: { accessToken: string; refreshToken: string; user: SupplierUser }) => void;
  setUser: (user: SupplierUser) => void;
  logout:  () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken:     null,
      refreshToken:    null,
      user:            null,
      isAuthenticated: false,

      setAuth: ({ accessToken, refreshToken, user }) => {
        set({ accessToken, refreshToken, user, isAuthenticated: true });
      },

      setUser: (user) => set({ user }),

      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name:    "vivre-supplier-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
        user:         state.user,
        isAuthenticated: state.accessToken !== null,
      }),
    }
  )
);
