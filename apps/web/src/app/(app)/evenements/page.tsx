"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/page.tsx — EV_001 : Découverte d'événements
 *
 * Affiche les événements approuvés et publiés, filtrables par :
 *   - Catégorie (concert, sport, festival, conférence…)
 *   - Ville
 *   - Recherche textuelle par nom/lieu
 *
 * Les événements "mis en avant" (is_featured) apparaissent en tête.
 * Pagination infinie via useInfiniteQuery.
 *
 * Accessible sans connexion — la réservation nécessite un compte.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface EventCategory {
  id: string;
  name: string;
  icon?: string;
  color_hex: string;
}

interface City {
  id: string;
  name: string;
}

interface EventCard {
  id: string;
  title: string;
  slug: string;
  cover_url?: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  is_featured: boolean;
  city: { name: string };
  category: { name: string; icon?: string; color_hex: string };
  min_price: number;
  bookings_count: number;
}

interface EventsPage {
  events: EventCard[];
  total: number;
  page: number;
  pages: number;
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function EvenementsPage(): React.ReactElement {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  /* Charger les catégories pour les filtres */
  const { data: categoriesData } = useQuery<{ categories: EventCategory[] }>({
    queryKey: ["event-categories"],
    queryFn: () => apiClient.get<{ categories: EventCategory[] }>("/events/categories"),
    staleTime: 60 * 60 * 1000, /* 1 heure */
  });

  const categories = categoriesData?.categories ?? [];

  /* Charger les villes pour le filtre */
  const { data: citiesData } = useQuery<{ cities: City[] }>({
    queryKey: ["cities"],
    queryFn: () => apiClient.get<{ cities: City[] }>("/cities"),
    staleTime: 60 * 60 * 1000, /* 1 heure */
  });

  const cities = citiesData?.cities ?? [];

  /* Pub "Tuile découverte" — insérée dans la grille, jamais en tête de résultats */
  interface BrowseAd { id: string; title: string; image_url: string; media_type: string; link_url: string }
  const { data: adsData } = useQuery<{ campaigns: BrowseAd[] }>({
    queryKey: ["ads-browse-tile"],
    queryFn: () => apiClient.get<{ campaigns: BrowseAd[] }>("/ads/active?placement=browse_tile"),
    staleTime: 5 * 60 * 1000, /* 5 min */
    /* Une pub démarre/s'arrête toute seule selon start_date/end_date — sans refetch
     * périodique, quelqu'un qui reste sur cette page ne voit jamais une pub expirer ni
     * une nouvelle démarrer avant de recharger (voir le même correctif dans SponsoredSection). */
    refetchInterval: 2 * 60 * 1000,
  });
  const browseAds = adsData?.campaigns ?? [];

  /* Construire les query params de recherche */
  const queryParams = new URLSearchParams();
  if (selectedCategory) queryParams.set("category_id", selectedCategory);
  if (selectedCity) queryParams.set("city_id", selectedCity);
  if (searchQuery) queryParams.set("q", searchQuery);
  queryParams.set("limit", "12");

  /* Pagination infinie */
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<EventsPage>({
    queryKey: ["events", selectedCategory, selectedCity, searchQuery],
    queryFn: ({ pageParam = 1 }) => {
      queryParams.set("page", String(pageParam));
      return apiClient.get<EventsPage>(`/events?${queryParams.toString()}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
  });

  const allEvents = data?.pages.flatMap((p) => p.events) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    setSearchQuery(searchInput);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
      {/* En-tête */}
      <div className="bg-gradient-to-br from-[#1A1A2E] to-[#1A6B3A] px-4 pt-12 pb-8">
        <h1 className="text-white text-2xl font-bold font-['Sora']">Événements</h1>
        <p className="text-green-200 text-sm mt-1">Découvrez ce qui se passe au Burkina</p>

        {/* Barre de recherche */}
        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Chercher un événement, un lieu..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 bg-white/20 text-white placeholder-white/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white/30"
          />
          <button
            type="submit"
            className="bg-white/20 text-white px-4 rounded-xl hover:bg-white/30 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </form>

        {/* Filtre ville */}
        <div className="mt-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-white/20 text-white text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:bg-white/30 appearance-none"
          >
            <option value="" className="text-gray-900">Toutes les villes</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id} className="text-gray-900">{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filtres catégories */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setSelectedCategory("")}
            className={`px-4 py-2 rounded-full text-sm font-medium flex-shrink-0 transition-all ${
              !selectedCategory
                ? "bg-[#1A6B3A] text-white shadow-sm"
                : "bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-700"
            }`}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? "" : cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium flex-shrink-0 transition-all flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? "text-white shadow-sm"
                  : "bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-700"
              }`}
              style={selectedCategory === cat.id ? { backgroundColor: cat.color_hex } : {}}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="px-4 pb-8">
        {/* Résultat de recherche */}
        {searchQuery && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {total} résultat{total > 1 ? "s" : ""} pour « {searchQuery} »
            </p>
            <button
              onClick={() => { setSearchQuery(""); setSearchInput(""); }}
              className="text-[#1A6B3A] text-xs font-medium"
            >
              Effacer
            </button>
          </div>
        )}

        {/* Événements vedettes */}
        {!searchQuery && !selectedCategory && !selectedCity && (
          <FeaturedEvents onSelect={(id) => router.push(`/evenements/${id}`)} />
        )}

        {/* Titre section */}
        {!searchQuery && (
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mt-6 mb-3">
            {selectedCategory || selectedCity ? "Événements filtrés" : "Tous les événements"}
          </h2>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-dark-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-36 bg-gray-200 dark:bg-dark-700" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-dark-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-dark-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Aucun résultat */}
        {!isLoading && allEvents.length === 0 && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🎪</div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">Aucun événement</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {searchQuery
                ? "Essayez d'autres mots-clés"
                : "Aucun événement disponible pour le moment"}
            </p>
          </div>
        )}

        {/* Grille d'événements — une tuile "Sponsorisé" insérée toutes les 6 tuiles (~un
            écran de grille 2 colonnes) quand une pub browse_tile est active, jamais en tête. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {allEvents.map((event, i) => (
            <React.Fragment key={event.id}>
              <EventCardComponent
                event={event}
                onPress={() => router.push(`/evenements/${event.id}`)}
              />
              {browseAds.length > 0 && (i + 1) % 6 === 0 && (
                <AdBrowseTile ad={browseAds[Math.floor(i / 6) % browseAds.length]!} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Charger plus */}
        {hasNextPage && (
          <button
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full mt-4 py-3 border border-gray-200 dark:border-dark-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 font-medium disabled:opacity-60"
          >
            {isFetchingNextPage ? "Chargement..." : "Voir plus d'événements"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Événements vedettes (carrousel horizontal)
 * ============================================================ */

function FeaturedEvents({
  onSelect,
}: {
  onSelect: (id: string) => void;
}): React.ReactElement {
  const { data } = useQuery<EventsPage>({
    queryKey: ["events-featured"],
    queryFn: () => apiClient.get<EventsPage>("/events?featured=true&limit=5"),
    staleTime: 5 * 60 * 1000,
  });

  const featured = data?.events ?? [];
  if (featured.length === 0) return <></>;

  return (
    <div className="mt-2">
      <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">À la une</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
        {featured.map((event) => (
          <button
            key={event.id}
            onClick={() => onSelect(event.id)}
            className="flex-shrink-0 w-64 bg-white dark:bg-dark-800 rounded-2xl overflow-hidden shadow-md text-left active:scale-[0.98] transition-transform"
          >
            {event.cover_url ? (
              <img
                src={event.cover_url}
                alt={event.title}
                className="w-full h-36 object-cover"
              />
            ) : (
              <div className="w-full h-36 bg-gradient-to-br from-[#1A6B3A] to-[#F5A623] flex items-center justify-center">
                <span className="text-white text-4xl">{event.category.icon ?? "🎪"}</span>
              </div>
            )}
            <div className="p-3">
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm line-clamp-2">{event.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatEventDate(event.starts_at)} • {formatEventTime(event.starts_at)}
              </p>
              <p className="text-xs text-[#1A6B3A] font-semibold mt-1">
                {event.min_price === 0 ? "Gratuit" : `À partir de ${event.min_price.toLocaleString("fr-FR")} FCFA`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Carte d'événement (grille 2 colonnes)
 * ============================================================ */

function EventCardComponent({
  event,
  onPress,
}: {
  event: EventCard;
  onPress: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onPress}
      className="bg-white dark:bg-dark-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left active:scale-[0.98]"
    >
      {/* Image ou gradient */}
      {event.cover_url ? (
        <img
          src={event.cover_url}
          alt={event.title}
          className="w-full h-28 object-cover"
        />
      ) : (
        <div
          className="w-full h-28 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${event.category.color_hex}88, ${event.category.color_hex})` }}
        >
          <span className="text-3xl">{event.category.icon ?? "🎪"}</span>
        </div>
      )}

      {/* Info */}
      <div className="p-2.5">
        {event.is_featured && (
          <span className="text-[10px] font-bold text-[#F5A623] uppercase tracking-wide">
            ⭐ À la une
          </span>
        )}
        <p className="font-semibold text-gray-900 dark:text-gray-100 text-xs line-clamp-2 mt-0.5 leading-tight">
          {event.title}
        </p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          {formatEventDate(event.starts_at)}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{event.venue_name}</p>
        <p className="text-xs font-bold text-[#1A6B3A] mt-1.5">
          {event.min_price === 0 ? "Gratuit" : `${event.min_price.toLocaleString("fr-FR")} F`}
        </p>
      </div>
    </button>
  );
}

/**
 * Tuile "Sponsorisé" — même gabarit que EventCardComponent pour s'intégrer naturellement
 * à la grille (native ad), mais toujours étiquetée clairement, jamais déguisée en événement réel.
 */
function AdBrowseTile({ ad }: { ad: { id: string; title: string; image_url: string; media_type: string; link_url: string } }): React.ReactElement {
  return (
    <a
      href={ad.link_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => {
        void fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
      }}
      className="bg-white dark:bg-dark-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left active:scale-[0.98] block"
    >
      <div className="relative">
        {ad.media_type === "video" ? (
          <video src={ad.image_url} className="w-full h-28 object-cover" autoPlay muted loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- créative externe, pas dans /public
          <img src={ad.image_url} alt={ad.title} className="w-full h-28 object-cover" />
        )}
        <span className="absolute top-1.5 left-1.5 text-[9px] font-jakarta font-bold uppercase tracking-wide text-white bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
          Sponsorisé
        </span>
      </div>
      <div className="p-2.5">
        <p className="font-semibold text-gray-900 dark:text-gray-100 text-xs line-clamp-2 mt-0.5 leading-tight">
          {ad.title}
        </p>
      </div>
    </a>
  );
}
