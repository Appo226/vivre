"use client";

/**
 * components/AdminGuard.tsx — Garde-fou client pour les pages /admin/*
 *
 * La vraie sécurité est côté serveur (chaque route /api/admin/* renvoie 403 si le rôle
 * "admin" est absent) — ce composant n'est qu'une UX : éviter d'afficher une page vide/en
 * erreur à un non-admin, et le rediriger proprement. Le middleware protège déjà /admin
 * contre les visiteurs sans token du tout (voir middleware.ts).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function AdminGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && !user.roles.includes("admin")) {
      router.replace("/");
    }
  }, [user, router]);

  /* user === null pendant l'hydratation Zustand (persist) — on affiche un loader plutôt
     que de rediriger prématurément un admin légitime dont le store n'a pas encore chargé. */
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#1A6B3A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user.roles.includes("admin")) {
    return null;
  }

  return <>{children}</>;
}
