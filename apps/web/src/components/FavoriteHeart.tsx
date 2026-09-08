"use client";

/**
 * components/FavoriteHeart.tsx — Bouton cœur réutilisable sur une carte/page événement.
 *
 * L'accueil est un Server Component sans connaissance de l'utilisateur connecté (le JWT ne
 * vit que côté client, voir MyTicketsSummary) — impossible d'y injecter is_favorited au
 * rendu serveur. Ce composant résout ça côté client : un seul GET /events/favorites/ids
 * partagé (react-query dédoublonne automatiquement, peu importe le nombre de cœurs affichés
 * sur la page) hydrate l'état initial de tous les cœurs à la fois, pas un fetch par carte.
 */

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface FavoriteIdsResponse {
  event_ids: string[];
}

export function FavoriteHeart({
  eventId,
  size = 20,
  className = "",
}: {
  eventId: string;
  size?: number;
  className?: string;
}): React.ReactElement {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();

  const { data } = useQuery<FavoriteIdsResponse>({
    queryKey: ["favorite-ids"],
    queryFn: () => apiClient.get<FavoriteIdsResponse>("/events/favorites/ids"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const isFavorited = data?.event_ids.includes(eventId) ?? false;

  async function toggle(e: React.MouseEvent): Promise<void> {
    e.preventDefault(); // la carte entière est souvent un <Link> -- ne pas naviguer au clic sur le cœur
    e.stopPropagation();

    if (!isAuthenticated) {
      router.push(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const previous = queryClient.getQueryData<FavoriteIdsResponse>(["favorite-ids"]);
    const next = isFavorited
      ? (previous?.event_ids ?? []).filter((id) => id !== eventId)
      : [...(previous?.event_ids ?? []), eventId];
    // Optimiste : le cœur change instantanément, avant même la réponse réseau -- une
    // interaction aussi triviale ne doit jamais paraître poser une question au serveur.
    queryClient.setQueryData<FavoriteIdsResponse>(["favorite-ids"], { event_ids: next });

    try {
      if (isFavorited) {
        await apiClient.delete(`/events/${eventId}/favorite`);
      } else {
        await apiClient.post(`/events/${eventId}/favorite`, {});
      }
    } catch {
      // Repli sur l'état d'avant en cas d'échec réseau -- pas de message d'erreur pour un
      // cœur, juste annuler silencieusement le changement optimiste.
      if (previous) queryClient.setQueryData<FavoriteIdsResponse>(["favorite-ids"], previous);
    }
  }

  return (
    // <span role="button">, pas <button> : ce composant s'utilise à l'intérieur d'autres
    // éléments cliquables (carte = <button> ou <Link>) — un <button> imbriqué dans un autre
    // <button>/<a> est du HTML invalide et casse le clic de façon imprévisible selon les
    // navigateurs. Un span avec role="button" reste focusable/actionnable au clavier sans
    // être un élément "interactif" au sens du spec HTML, donc l'imbrication reste valide.
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => void toggle(e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") void toggle(e as unknown as React.MouseEvent);
      }}
      aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={isFavorited}
      className={`flex items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isFavorited ? "#EF2B2D" : "none"}
        stroke={isFavorited ? "#EF2B2D" : "currentColor"}
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        />
      </svg>
    </span>
  );
}
