/**
 * app/(app)/urgences/page.tsx — SP-001 : Hub des urgences
 *
 * Écran critique, accessible SANS connexion (route publique dans middleware.ts).
 * Affiche :
 *   1. Numéros d'urgence nationaux (SAMU 112, Police 17, etc.) — appelables en 1 tap
 *   2. Pharmacies de garde à proximité (si GPS disponible)
 *   3. Grille des catégories de services publics (hôpitaux, police, pompiers…)
 *
 * Stratégie offline-first :
 *   - Numéros d'urgence : Cache-Control 7 jours (headers API) + SWR stale-while-revalidate
 *   - Position GPS : demandée côté client avec fallback gracieux si refusée
 *   - Si l'API est hors ligne : afficher les données cachées par le Service Worker
 *
 * Cette page est "use client" car elle utilise :
 *   - La géolocalisation (navigator.geolocation)
 *   - TanStack Query pour le data fetching avec cache
 *   - Appels téléphoniques via tel: links
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

/* ============================================================
 * TYPES
 * ============================================================ */

interface EmergencyNumber {
  id: string;
  service_name: string;
  service_name_en: string;
  number: string;
  icon: string;
  color_hex: string;
  sort_order: number;
}

interface ServiceCategory {
  id: string;
  slug: string;
  name_fr: string;
  name_en: string;
  icon: string;
  color_hex: string;
  is_emergency: boolean;
  sort_order: number;
}

interface PharmacyOnDuty {
  id: string;
  name: string;
  address: string;
  phone_primary: string | null;
  phone_emergency: string | null;
  distance_m: number | null;
  is_on_duty: boolean;
  on_duty_until: string | null;
}

interface GeoPosition {
  lat: number;
  lng: number;
}

/* ============================================================
 * FETCH FUNCTIONS (cachées par TanStack Query)
 * ============================================================ */

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";

async function fetchEmergencyNumbers(): Promise<EmergencyNumber[]> {
  const res = await fetch(`${API_URL}/emergency-numbers`, {
    /* Cache agressif : les numéros d'urgence changent très rarement */
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error("Erreur chargement numéros d'urgence");
  const data = await res.json() as { numbers: EmergencyNumber[] };
  return data.numbers;
}

async function fetchCategories(): Promise<ServiceCategory[]> {
  const res = await fetch(`${API_URL}/public-services/categories`);
  if (!res.ok) throw new Error("Erreur chargement catégories");
  const data = await res.json() as { categories: ServiceCategory[] };
  return data.categories;
}

async function fetchPharmaciesOnDuty(pos?: GeoPosition): Promise<PharmacyOnDuty[]> {
  const url = new URL(`${API_URL}/public-services/on-duty`);
  if (pos) {
    url.searchParams.set("lat", String(pos.lat));
    url.searchParams.set("lng", String(pos.lng));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Erreur chargement pharmacies de garde");
  const data = await res.json() as { pharmacies: PharmacyOnDuty[] };
  return data.pharmacies;
}

/* ============================================================
 * COMPOSANTS ATOMIQUES
 * ============================================================ */

/**
 * Carte d'un numéro d'urgence — appel direct au tap.
 * L'aria-label inclut le nom et le numéro pour les lecteurs d'écran.
 */
function EmergencyCard({ item }: { item: EmergencyNumber }): React.ReactElement {
  return (
    <a
      href={`tel:${item.number}`}
      aria-label={`Appeler ${item.service_name} au ${item.number}`}
      className={[
        "flex items-center gap-3 p-4 rounded-2xl",
        "bg-white border-2 active:scale-95 transition-transform duration-100",
        "shadow-sm",
      ].join(" ")}
      style={{ borderColor: item.color_hex }}
    >
      {/* Icône dans un cercle coloré */}
      <span
        className="flex items-center justify-center w-12 h-12 rounded-full text-2xl flex-shrink-0"
        style={{ backgroundColor: `${item.color_hex}18` }} /* 10% opacity */
        aria-hidden="true"
      >
        {item.icon}
      </span>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{item.service_name}</p>
        <p className="text-2xl font-bold" style={{ color: item.color_hex }}>
          {item.number}
        </p>
      </div>

      {/* Icône téléphone */}
      <span style={{ color: item.color_hex }} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd"/>
        </svg>
      </span>
    </a>
  );
}

/**
 * Carte d'une pharmacie de garde.
 * Affiche la distance en km si disponible.
 */
function PharmacyCard({ pharmacy }: { pharmacy: PharmacyOnDuty }): React.ReactElement {
  const distanceText = pharmacy.distance_m !== null
    ? pharmacy.distance_m < 1000
      ? `${Math.round(pharmacy.distance_m)} m`
      : `${(pharmacy.distance_m / 1000).toFixed(1)} km`
    : null;

  const phone = pharmacy.phone_emergency ?? pharmacy.phone_primary;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug">{pharmacy.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{pharmacy.address}</p>
        </div>
        {distanceText && (
          <span className="flex-shrink-0 text-xs font-medium text-[#1A6B3A] bg-green-50 px-2 py-1 rounded-full">
            {distanceText}
          </span>
        )}
      </div>

      {phone && (
        <a
          href={`tel:${phone}`}
          className="mt-3 flex items-center gap-2 text-sm font-medium text-[#1A6B3A] hover:underline"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd"/>
          </svg>
          {phone}
        </a>
      )}
    </div>
  );
}

/**
 * Carte d'une catégorie de services publics.
 * Navigue vers /services?category={slug}.
 */
function CategoryCard({ category }: { category: ServiceCategory }): React.ReactElement {
  return (
    <Link
      href={`/services?category=${category.slug}`}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-95 transition-transform duration-100"
    >
      <span
        className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
        style={{ backgroundColor: `${category.color_hex}15` }}
        aria-hidden="true"
      >
        {category.icon}
      </span>
      <span className="text-xs font-medium text-gray-700 text-center leading-tight">
        {category.name_fr}
      </span>
    </Link>
  );
}

/* ============================================================
 * SKELETON (état de chargement)
 * ============================================================ */

function SkeletonCard(): React.ReactElement {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-6 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function UrgencesPage(): React.ReactElement {
  /* Position GPS pour le tri des pharmacies par distance */
  const [geoPosition, setGeoPosition] = useState<GeoPosition | undefined>(undefined);
  const [geoError, setGeoError] = useState(false);

  /* Demander la position GPS au montage */
  const requestGeo = useCallback((): void => {
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        /* GPS refusé ou non disponible — fonctionnement dégradé gracieux */
        setGeoError(true);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    requestGeo();
  }, [requestGeo]);

  /* ============================================================
   * DATA FETCHING
   * Stale time élevé : les numéros d'urgence changent rarement.
   * GcTime = 7 jours pour survival en mode offline.
   * ============================================================ */
  const { data: emergencyNumbers, isLoading: loadingNumbers } = useQuery({
    queryKey: ["emergency-numbers"],
    queryFn: fetchEmergencyNumbers,
    staleTime: 24 * 60 * 60 * 1000, /* 24h */
    gcTime: 7 * 24 * 60 * 60 * 1000, /* 7 jours en cache mémoire */
  });

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ["service-categories"],
    queryFn: fetchCategories,
    staleTime: 60 * 60 * 1000, /* 1h */
  });

  const { data: pharmacies, isLoading: loadingPharmacies } = useQuery({
    queryKey: ["pharmacies-on-duty", geoPosition?.lat, geoPosition?.lng],
    queryFn: () => fetchPharmaciesOnDuty(geoPosition),
    staleTime: 30 * 60 * 1000, /* 30 min — peut changer dans la journée */
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== HEADER ===== */}
      <header className="bg-[#EF2B2D] text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">🚨</span>
          <div>
            <h1 className="text-xl font-bold font-sora">Urgences & Services</h1>
            <p className="text-red-100 text-sm mt-0.5">Accès rapide aux secours et services publics</p>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">

        {/* ===== SECTION : NUMÉROS D'URGENCE ===== */}
        <section aria-labelledby="emergency-numbers-heading">
          <h2 id="emergency-numbers-heading" className="text-base font-bold text-gray-900 mb-3">
            Numéros d'urgence
          </h2>

          {loadingNumbers ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : emergencyNumbers && emergencyNumbers.length > 0 ? (
            <div className="space-y-3">
              {emergencyNumbers.map((item) => (
                <EmergencyCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            /* Fallback si l'API est hors ligne et le cache vide */
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-red-700 font-medium">Numéros d'urgence non disponibles</p>
              <p className="text-xs text-red-500 mt-1">Appelez le 17 (Police) ou le 18 (Pompiers)</p>
            </div>
          )}
        </section>

        {/* ===== SECTION : PHARMACIES DE GARDE ===== */}
        <section aria-labelledby="pharmacies-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="pharmacies-heading" className="text-base font-bold text-gray-900">
              Pharmacies de garde
            </h2>
            <Link
              href="/services?category=pharmacie"
              className="text-xs text-[#1A6B3A] font-medium"
            >
              Voir tout
            </Link>
          </div>

          {/* Indication GPS */}
          {!geoPosition && !geoError && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 animate-pulse text-[#1A6B3A]" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.099 3.468-4.698 3.468-8.05a6.75 6.75 0 00-13.5 0c0 3.352 1.524 5.951 3.468 8.05a19.58 19.58 0 002.683 2.282 16.975 16.975 0 001.144.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
              </svg>
              Localisation en cours…
            </div>
          )}
          {geoError && (
            <p className="text-xs text-gray-400 mb-3">
              GPS non disponible — affichage sans tri par distance
            </p>
          )}

          {loadingPharmacies ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : pharmacies && pharmacies.length > 0 ? (
            <div className="space-y-3">
              {pharmacies.slice(0, 3).map((p) => (
                <PharmacyCard key={p.id} pharmacy={p} />
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 rounded-2xl p-4 text-center">
              <p className="text-sm text-gray-500">Aucune pharmacie de garde actuellement</p>
            </div>
          )}
        </section>

        {/* ===== SECTION : CATÉGORIES DE SERVICES ===== */}
        <section aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="text-base font-bold text-gray-900 mb-3">
            Services publics
          </h2>

          {loadingCategories ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-3 border border-gray-100 animate-pulse">
                  <div className="w-12 h-12 rounded-xl bg-gray-200 mx-auto mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-3/4 mx-auto" />
                </div>
              ))}
            </div>
          ) : categories && categories.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {categories.map((cat) => (
                <CategoryCard key={cat.id} category={cat} />
              ))}
            </div>
          ) : null}
        </section>

      </div>
    </div>
  );
}
