"use client";

/**
 * components/MyTicketsSummary.tsx — Module "Vos billets" de l'accueil.
 *
 * L'accueil est un Server Component sans accès à l'identité du visiteur (le JWT ne vit
 * que côté client) — ce module compense en composant client, comme SponsoredSection.
 * Rien ne s'affiche pour un visiteur non connecté (l'accueil reste consultable sans
 * compte — voir evenements/page.tsx) : pas de prompt de connexion qui n'aurait pas sa
 * place ici, la connexion se fait déjà via la nav ou l'action d'achat elle-même.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface BookingsMeResponse {
  bookings: unknown[];
  total: number;
}

export function MyTicketsSummary(): React.ReactElement | null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data } = useQuery<BookingsMeResponse>({
    queryKey: ["my-bookings-count"],
    queryFn: () => apiClient.get<BookingsMeResponse>("/events/bookings/me?filter=upcoming"),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  if (!isAuthenticated) return null;

  const count = data?.total ?? 0;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sora font-bold text-ink">Vos billets</h2>
        <Link href="/evenements/mes-billets" className="text-sm font-semibold text-[#1A6B3A] dark:text-green-300">
          Voir mes billets
        </Link>
      </div>

      {count === 0 ? (
        <div className="rounded-card bg-surface-elevated border border-border-subtle p-5 flex items-center gap-4">
          <span className="w-12 h-12 rounded-full bg-surface-card flex items-center justify-center text-2xl flex-shrink-0">🎟️</span>
          <div className="min-w-0">
            <p className="font-jakarta font-bold text-sm text-ink">Vous n&apos;avez aucun billet</p>
            <p className="text-xs text-ink-soft font-dm mt-0.5">Réservez vos prochains événements en quelques clics.</p>
          </div>
        </div>
      ) : (
        <Link
          href="/evenements/mes-billets"
          className="flex items-center gap-4 rounded-card bg-surface-elevated border border-border-subtle p-5 hover:bg-surface-card transition-colors"
        >
          <span className="w-12 h-12 rounded-full bg-[#1A6B3A]/10 flex items-center justify-center text-2xl flex-shrink-0">🎫</span>
          <div className="min-w-0 flex-1">
            <p className="font-jakarta font-bold text-sm text-ink">
              {count} billet{count > 1 ? "s" : ""} à venir
            </p>
            <p className="text-xs text-ink-soft font-dm mt-0.5">Retrouvez vos QR codes et vos événements à venir.</p>
          </div>
          <span className="text-ink-soft">›</span>
        </Link>
      )}
    </section>
  );
}
