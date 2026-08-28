/**
 * store/theme.store.ts — Préférence de thème (clair / sombre)
 *
 * Deux modes seulement, choisis explicitement par la personne — pas de mode
 * "système" qui suivrait le téléphone en silence. Clair est la valeur par
 * défaut. Le choix est persisté (survit à la fermeture de l'app) et appliqué
 * en ajoutant/retirant la classe "dark" sur <html> — c'est la stratégie que
 * Tailwind attend déjà (darkMode: "class" dans @vivre/config/tailwind).
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemePreference = "light" | "dark";

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/** Applique/retire la classe "dark" sur <html> — seul point qui touche le DOM. */
export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "vivre-theme",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Au premier rendu client, réappliquer la classe au cas où le script
        // anti-flash (voir layout.tsx) ait résolu une valeur différente.
        if (state) applyTheme(state.theme);
      },
    }
  )
);
