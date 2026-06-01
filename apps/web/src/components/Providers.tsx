/**
 * Providers.tsx — Client Providers pour l'application VIVRE
 *
 * Ce fichier est un Client Component qui enveloppe l'application avec :
 * - QueryClientProvider (TanStack Query) : gestion du server state et cache HTTP
 * - Toast Provider : notifications toast pour les actions utilisateur
 *
 * Pourquoi séparer les Providers du layout ?
 * layout.tsx est un Server Component — il ne peut pas utiliser de hooks React
 * ni de contextes (useState, useEffect, Context.Provider). En isolant les providers
 * dans ce Client Component, on garde layout.tsx purement côté serveur (meilleur SEO).
 *
 * "use client" est placé ici, pas dans layout.tsx — seuls les Providers
 * sont client-side. Leurs enfants peuvent rester Server Components.
 */

"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Client Providers pour l'application VIVRE.
 * Wraps tous les enfants avec les contextes nécessaires.
 */
export function Providers({ children }: ProvidersProps): React.ReactElement {
  /* Hydrate the Zustand auth store from localStorage on first mount */
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  /*
   * QueryClient créé avec useState pour éviter de le partager entre SSR et client.
   * Sans useState, le QueryClient serait partagé entre toutes les requêtes serveur
   * en Next.js (bug critique : données d'un utilisateur visibles par un autre).
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /*
             * staleTime = durée pendant laquelle les données sont considérées "fraiches".
             * 5 minutes = bon équilibre entre fraîcheur et réduction des appels API.
             * Les données de listes (restaurants, hôtels) ne changent pas à la seconde.
             */
            staleTime: 5 * 60 * 1000, /* 5 minutes */

            /*
             * gcTime (garbage collection) = durée avant de supprimer les données du cache.
             * 30 minutes = les données restent en mémoire même après unmount du composant.
             * Utile pour le retour arrière (back button) — pas de rechargement.
             */
            gcTime: 30 * 60 * 1000, /* 30 minutes */

            /*
             * retry = 1 seul retry en cas d'échec réseau.
             * Pas de retry infini — au Burkina, si le réseau est coupé, il faut
             * informer l'utilisateur rapidement plutôt que d'attendre en silence.
             */
            retry: 1,

            /*
             * refetchOnWindowFocus = false — évite les refetch automatiques
             * quand l'utilisateur revient sur l'onglet (trop de requêtes sur 3G).
             */
            refetchOnWindowFocus: false,
          },
          mutations: {
            /* Pas de retry sur les mutations (POST, PUT, DELETE) — idempotence non garantie */
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/*
       * TODO Step 2: Ajouter d'autres providers selon les besoins :
       * - ToastProvider (@radix-ui/react-toast)
       * - ZustandHydrationProvider (initialisation du store depuis les cookies)
       * - ThemeProvider (mode sombre — Phase 2)
       */}
      {children}
    </QueryClientProvider>
  );
}
