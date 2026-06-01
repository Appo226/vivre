"use client";

export const dynamic = "force-dynamic";

/**
 * hebergement/resultats/page.tsx — HE_002 : Résultats de recherche hébergement
 *
 * Affiche les hébergements disponibles pour une ville, des dates et un nombre
 * de voyageurs donnés. Deux modes :
 *   - Avec dates : POST /properties/search → résultats triés par dispo
 *   - Sans dates : GET /properties → liste complète (exploration)
 *
 * Pourquoi Suspense ?
 * useSearchParams() est un hook Next.js qui cause une erreur de rendu si
 * le composant n'est pas enveloppé dans <Suspense>. On extrait la logique
 * dans ResultatsContent et on wrape dans Suspense dans l'export default.
 */

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface RoomTypeAvail {
  id: string;
  name: string;
  max_occupancy: number;
  bed_type: string;
  price_per_night: number;
  available: number;
}

interface PropertyResult {
  id: string;
  name: string;
  property_type: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  star_rating: number | null;
  rating_avg: number | null;
  amenities: string[];
  check_in_time: string;
  check_out_time: string;
  city: { name: string };
  /* Présent seulement en mode recherche avec dates */
  min_price_per_night?: number;
  total_for_stay?: number;
  nights?: number;
  available_room_types?: RoomTypeAvail[];
}

const PROPERTY_TYPES: Record<string, { label: string; icon: string }> = {
  hotel:    { label: "Hôtel",     icon: "🏩" },
  auberge:  { label: "Auberge",   icon: "🏘️" },
  campement:{ label: "Campement", icon: "⛺" },
  private:  { label: "Location",  icon: "🏠" },
  hostel:   { label: "Hostel",    icon: "🛏️" },
};

const BED_TYPES: Record<string, string> = {
  single: "Lit simple", double: "Lit double", twin: "Lits jumeaux", king: "Lit king",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * CONTENU (séparé pour Suspense)
 * ============================================================ */

function ResultatsContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* Paramètres de la recherche */
  const cityId       = searchParams.get("city_id") ?? "";
  const checkin      = searchParams.get("checkin") ?? "";
  const checkout     = searchParams.get("checkout") ?? "";
  const guests       = parseInt(searchParams.get("guests") ?? "1", 10);
  const propertyType = searchParams.get("property_type") ?? "";

  /* État */
  const [properties, setProperties] = useState<PropertyResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [nights, setNights] = useState(0);

  /* Filtres locaux */
  const [sortBy, setSortBy] = useState<"price" | "rating">("rating");

  useEffect(() => {
    if (!cityId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchData = async (): Promise<void> => {
      try {
        if (checkin && checkout) {
          /* Mode recherche avec disponibilité */
          const res = await apiClient.post<{
            properties: PropertyResult[];
            total: number;
            search_params: { nights: number };
          }>("/properties/search", {
            city_id: cityId,
            checkin,
            checkout,
            guests,
            ...(propertyType && { property_type: propertyType }),
          });
          setProperties(res.properties);
          setTotal(res.total);
          setNights(res.search_params.nights);
        } else {
          /* Mode exploration sans dates */
          const params = new URLSearchParams({ city_id: cityId, limit: "50" });
          if (propertyType) params.set("property_type", propertyType);

          const res = await apiClient.get<{ properties: PropertyResult[]; total: number }>(
            `/properties?${params.toString()}`
          );
          setProperties(res.properties);
          setTotal(res.total);
        }
      } catch {
        setProperties([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [cityId, checkin, checkout, guests, propertyType]);

  /* Tri local des résultats */
  const sorted = [...properties].sort((a, b) => {
    if (sortBy === "price") {
      return (a.min_price_per_night ?? 0) - (b.min_price_per_night ?? 0);
    }
    return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
  });

  const hasDateSearch = Boolean(checkin && checkout);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">
            {isLoading ? "Recherche en cours..." : `${total} hébergement${total > 1 ? "s" : ""}`}
          </p>
          {hasDateSearch && (
            <p className="text-xs text-gray-500 truncate">
              {checkin} → {checkout} · {guests} voyageur{guests > 1 ? "s" : ""} · {nights} nuit{nights > 1 ? "s" : ""}
            </p>
          )}
        </div>
        {/* Bouton modifier la recherche */}
        <button
          onClick={() => router.push("/hebergement")}
          className="text-xs text-[#1A6B3A] font-semibold border border-[#1A6B3A]/30 rounded-xl px-3 py-1.5"
        >
          Modifier
        </button>
      </div>

      {/* Tri */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        {(["rating", "price"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              sortBy === s
                ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {s === "rating" ? "★ Mieux notés" : "Prix croissant"}
          </button>
        ))}
      </div>

      {/* Résultats */}
      <div className="px-4 pb-24 space-y-4">
        {isLoading ? (
          /* Squelettes */
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          ))
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🏨</p>
            <p className="font-semibold text-gray-800">Aucun hébergement disponible</p>
            <p className="text-sm text-gray-500 mt-1">
              {hasDateSearch
                ? "Essayez d'autres dates ou d'autres critères"
                : "Cette ville n'a pas encore d'hébergements référencés"}
            </p>
            <button
              onClick={() => router.push("/hebergement")}
              className="mt-4 bg-[#1A6B3A] text-white font-semibold px-6 py-3 rounded-xl"
            >
              Modifier la recherche
            </button>
          </div>
        ) : (
          sorted.map((prop) => (
            <ResultCard
              key={prop.id}
              property={prop}
              nights={nights}
              hasDateSearch={hasDateSearch}
              checkin={checkin}
              checkout={checkout}
              guests={guests}
              onClick={() => {
                const params = new URLSearchParams();
                if (checkin) params.set("checkin", checkin);
                if (checkout) params.set("checkout", checkout);
                if (guests > 1) params.set("guests", String(guests));
                const qs = params.toString();
                router.push(`/hebergement/${prop.id}${qs ? `?${qs}` : ""}`);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * CARTE RÉSULTAT
 * ============================================================ */

function ResultCard({
  property,
  nights,
  hasDateSearch,
  onClick,
}: {
  property: PropertyResult;
  nights: number;
  hasDateSearch: boolean;
  checkin: string;
  checkout: string;
  guests: number;
  onClick: () => void;
}): React.ReactElement {
  const typeInfo = PROPERTY_TYPES[property.property_type];
  const cheapestRoom = property.available_room_types?.[0];

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 text-left overflow-hidden active:scale-[0.99] transition-all"
    >
      {/* Bandeau type */}
      <div className="px-4 pt-4 pb-3">
        {/* Nom + note */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-gray-900 text-sm flex-1 leading-tight">{property.name}</h3>
          {property.rating_avg && (
            <span className="flex-shrink-0 bg-[#1A6B3A]/10 text-[#1A6B3A] text-xs font-bold px-2 py-0.5 rounded-lg">
              ★ {property.rating_avg.toFixed(1)}
            </span>
          )}
        </div>

        {/* Adresse + étoiles */}
        <p className="text-xs text-gray-500 mb-1">{property.address}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">
            {typeInfo?.icon} {typeInfo?.label}
          </span>
          {property.star_rating && (
            <span className="text-xs text-gray-400">
              {"★".repeat(property.star_rating)}{"☆".repeat(5 - property.star_rating)}
            </span>
          )}
        </div>

        {/* Check-in/out */}
        <p className="text-xs text-gray-400 mt-1">
          Arrivée {property.check_in_time} · Départ {property.check_out_time}
        </p>
      </div>

      {/* Chambre la moins chère (si recherche avec dates) */}
      {hasDateSearch && cheapestRoom && (
        <div className="mx-4 mb-3 bg-[#1A6B3A]/5 rounded-xl p-3">
          <p className="text-xs font-semibold text-[#1A6B3A] mb-1">Chambre disponible</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">{cheapestRoom.name}</p>
              <p className="text-xs text-gray-500">
                {BED_TYPES[cheapestRoom.bed_type] ?? cheapestRoom.bed_type}
                {" · "}{cheapestRoom.available} disponible{cheapestRoom.available > 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[#1A6B3A]">
                {formatFCFA(cheapestRoom.price_per_night)}/nuit
              </p>
              {nights > 0 && (
                <p className="text-xs text-gray-500">
                  {formatFCFA(cheapestRoom.price_per_night * nights)} au total
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prix minimum (mode exploration sans dates) */}
      {!hasDateSearch && property.min_price_per_night && (
        <div className="px-4 pb-4">
          <p className="text-sm font-bold text-[#1A6B3A]">
            À partir de {formatFCFA(property.min_price_per_night)}/nuit
          </p>
        </div>
      )}
    </button>
  );
}

/* ============================================================
 * EXPORT DEFAULT avec Suspense (requis par useSearchParams)
 * ============================================================ */

export default function ResultatsPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Recherche des hébergements...</p>
          </div>
        </div>
      }
    >
      <ResultatsContent />
    </Suspense>
  );
}
