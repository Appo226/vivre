/**
 * app/(app)/services/page.tsx — SP-002 : Liste des services publics
 *
 * Affiche les services publics filtrés par catégorie et triés par distance GPS.
 * Appelé depuis la grille de catégories de SP-001 (/urgences).
 *
 * Query params supportés :
 *   ?category={slug}  — filtre par catégorie (ex: "hopital", "police")
 *   ?city_id={uuid}   — filtre par ville (défaut : ville détectée)
 *
 * Tri : par distance GPS si position disponible, sinon par nom alphabétique.
 * La distance est calculée côté API via PostGIS (index GIST — très rapide).
 *
 * Pagination : load-more (pas de pagination classique) pour une UX fluide mobile.
 */

"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

/* ============================================================
 * TYPES
 * ============================================================ */

interface ServiceItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone_primary: string | null;
  phone_emergency: string | null;
  is_open_now: boolean;
  is_on_duty: boolean;
  is_24h: boolean;
  on_duty_until: string | null;
  distance_m: number | null;
  category_id: string;
  category_slug: string;
  category_name_fr: string;
  category_icon: string;
  category_color_hex: string;
}

interface ServiceCategory {
  id: string;
  slug: string;
  name_fr: string;
  icon: string;
  color_hex: string;
  is_emergency: boolean;
}

interface GeoPosition {
  lat: number;
  lng: number;
}

/* ============================================================
 * FETCH
 * ============================================================ */

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";

async function fetchServices(params: {
  categorySlug?: string;
  lat?: number;
  lng?: number;
  page: number;
  limit: number;
}): Promise<{ services: ServiceItem[]; page: number; limit: number }> {
  const url = new URL(`${API_URL}/public-services`);
  if (params.categorySlug) url.searchParams.set("category_slug", params.categorySlug);
  if (params.lat !== undefined) url.searchParams.set("lat", String(params.lat));
  if (params.lng !== undefined) url.searchParams.set("lng", String(params.lng));
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("limit", String(params.limit));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Erreur chargement services");
  return res.json() as Promise<{ services: ServiceItem[]; page: number; limit: number }>;
}

async function fetchCategories(): Promise<ServiceCategory[]> {
  const res = await fetch(`${API_URL}/public-services/categories`);
  if (!res.ok) throw new Error("Erreur chargement catégories");
  const data = await res.json() as { categories: ServiceCategory[] };
  return data.categories;
}

/* ============================================================
 * COMPOSANTS
 * ============================================================ */

function DistanceBadge({ distanceM }: { distanceM: number | null }): React.ReactElement | null {
  if (distanceM === null) return null;
  const text = distanceM < 1000
    ? `${Math.round(distanceM)} m`
    : `${(distanceM / 1000).toFixed(1)} km`;

  return (
    <span className="text-xs font-medium text-[#1A6B3A] bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
      {text}
    </span>
  );
}

function StatusBadge({ isOpen, is24h }: { isOpen: boolean; is24h: boolean }): React.ReactElement {
  if (is24h) {
    return (
      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
        24h/24
      </span>
    );
  }
  return isOpen ? (
    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
      Ouvert
    </span>
  ) : (
    <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
      Fermé
    </span>
  );
}

function ServiceCard({ service }: { service: ServiceItem }): React.ReactElement {
  const phone = service.phone_emergency ?? service.phone_primary;

  return (
    <Link
      href={`/services/${service.id}`}
      className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform duration-100"
    >
      <div className="flex items-start gap-3">
        {/* Icône catégorie */}
        <span
          className="flex items-center justify-center w-11 h-11 rounded-xl text-xl flex-shrink-0"
          style={{ backgroundColor: `${service.category_color_hex}15` }}
          aria-hidden="true"
        >
          {service.category_icon}
        </span>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{service.name}</p>
            <DistanceBadge distanceM={service.distance_m} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{service.address}</p>

          {/* Statut et contact */}
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge isOpen={service.is_open_now} is24h={service.is_24h} />
            {service.is_on_duty && (
              <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                De garde
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bouton appel rapide si numéro disponible */}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={(e) => e.stopPropagation()} /* Empêche la navigation vers le détail */
          className="mt-3 flex items-center gap-2 text-sm font-medium text-[#1A6B3A] hover:underline"
          aria-label={`Appeler ${service.name} au ${phone}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd"/>
          </svg>
          {phone}
        </a>
      )}
    </Link>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

const PAGE_LIMIT = 20;

/*
 * ServicesContent est séparé de la page principale pour permettre le wrapping
 * avec <Suspense>. Next.js 14 exige que tout composant appelant useSearchParams()
 * soit enfant d'un Suspense boundary — sinon la page échoue au prérendu SSG.
 */
function ServicesContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get("category") ?? undefined;

  const [geoPosition, setGeoPosition] = useState<GeoPosition | undefined>(undefined);

  /* Position GPS */
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS refusé — continuer sans */ },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  /* Catégories pour la barre de filtres */
  const { data: categories } = useQuery({
    queryKey: ["service-categories"],
    queryFn: fetchCategories,
    staleTime: 60 * 60 * 1000,
  });

  /* Services paginés avec infinite scroll (load more) */
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["services", categorySlug, geoPosition?.lat, geoPosition?.lng],
    queryFn: ({ pageParam }) => fetchServices({
      /*
       * Avec exactOptionalPropertyTypes, on ne peut pas passer `undefined`
       * explicitement pour une propriété optionnelle `field?: T`.
       * On utilise le spread conditionnel pour omettre la propriété complètement.
       */
      ...(categorySlug !== undefined && { categorySlug }),
      ...(geoPosition !== undefined && { lat: geoPosition.lat, lng: geoPosition.lng }),
      page: pageParam as number,
      limit: PAGE_LIMIT,
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      /* Tant qu'on reçoit une page pleine, il peut y avoir une suivante */
      lastPage.services.length === PAGE_LIMIT
        ? lastPage.page + 1
        : undefined,
  });

  /* Aplatir les pages en une liste unique */
  const services = data?.pages.flatMap((p) => p.services) ?? [];

  /* Infos de la catégorie sélectionnée */
  const currentCategory = categories?.find((c) => c.slug === categorySlug);

  const handleLoadMore = useCallback((): void => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== HEADER ===== */}
      <header className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* Bouton retour */}
          <Link href="/urgences" aria-label="Retour aux urgences" className="text-gray-600 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd"/>
            </svg>
          </Link>

          <div>
            <h1 className="text-lg font-bold text-gray-900 font-sora">
              {currentCategory
                ? `${currentCategory.icon} ${currentCategory.name_fr}`
                : "Services publics"}
            </h1>
            {geoPosition ? (
              <p className="text-xs text-[#1A6B3A]">Triés par distance</p>
            ) : (
              <p className="text-xs text-gray-400">Activez le GPS pour le tri par proximité</p>
            )}
          </div>
        </div>

        {/* Filtres par catégorie — scroll horizontal */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {/* Option "Tous" */}
            <Link
              href="/services"
              className={[
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                !categorySlug
                  ? "bg-[#1A6B3A] text-white"
                  : "bg-gray-100 text-gray-600",
              ].join(" ")}
            >
              Tous
            </Link>

            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/services?category=${cat.slug}`}
                className={[
                  "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  categorySlug === cat.slug
                    ? "text-white"
                    : "bg-gray-100 text-gray-600",
                ].join(" ")}
                style={categorySlug === cat.slug ? { backgroundColor: cat.color_hex } : {}}
              >
                <span aria-hidden="true">{cat.icon}</span>
                {cat.name_fr}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* ===== LISTE ===== */}
      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {isLoading ? (
          /* Skeletons de chargement */
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse">
              <div className="flex gap-3">
                <div className="w-11 h-11 rounded-xl bg-gray-200 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-5 bg-gray-200 rounded w-16" />
                </div>
              </div>
            </div>
          ))
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">Impossible de charger les services</p>
            <p className="text-gray-400 text-xs mt-1">Vérifiez votre connexion</p>
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-4xl" aria-hidden="true">
              {currentCategory?.icon ?? "🏛️"}
            </span>
            <p className="text-gray-500 text-sm mt-3">Aucun service trouvé</p>
            <p className="text-gray-400 text-xs mt-1">
              {categorySlug ? "Essayez une autre catégorie" : "Vérifiez votre connexion"}
            </p>
          </div>
        ) : (
          <>
            {/* Compteur */}
            <p className="text-xs text-gray-400 mb-1">
              {services.length} service{services.length > 1 ? "s" : ""} trouvé{services.length > 1 ? "s" : ""}
            </p>

            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}

            {/* Bouton "Charger plus" */}
            {hasNextPage && (
              <button
                onClick={handleLoadMore}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-sm font-medium text-[#1A6B3A] bg-white border border-[#1A6B3A] rounded-2xl disabled:opacity-50 transition-opacity"
              >
                {isFetchingNextPage ? "Chargement…" : "Voir plus de services"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/*
 * Page principale — wraps ServicesContent dans <Suspense>.
 * Le fallback est un écran de chargement minimal affiché lors du SSR.
 * Sans ce Suspense, Next.js échoue à prérender la page car useSearchParams()
 * n'est pas disponible lors du rendu serveur.
 */
export default function ServicesPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400 mt-3">Chargement des services…</p>
          </div>
        </div>
      }
    >
      <ServicesContent />
    </Suspense>
  );
}
