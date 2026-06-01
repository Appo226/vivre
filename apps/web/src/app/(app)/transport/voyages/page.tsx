"use client";

export const dynamic = "force-dynamic";

/**
 * transport/voyages/page.tsx — TI_002 : Résultats de recherche de voyages
 *
 * Lit les paramètres from/to/date/passengers depuis l'URL (useSearchParams)
 * et interroge POST /transport/search pour afficher les voyages disponibles.
 *
 * Chaque carte affiche :
 *   - Compagnie (nom + note)
 *   - Horaires (départ → arrivée)
 *   - Durée + distance
 *   - Type de bus (Standard, Confort, VIP)
 *   - Prix adulte + places disponibles
 *
 * Tri par défaut : heure de départ (le plus tôt d'abord).
 *
 * SUSPENSE : useSearchParams() exige un Suspense boundary pour le SSR Next.js.
 * On exporte un default qui enveloppe le contenu réel dans <Suspense>.
 */

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface TripResult {
  id: string;
  company: {
    id: string;
    name: string;
    logo_url?: string;
    rating_avg: number;
  };
  route: {
    origin_city: string;
    destination_city: string;
    distance_km: number;
    bus_type: string;
  };
  departure_datetime: string;
  arrival_datetime: string;
  duration_minutes: number;
  available_seats: number;
  prices: {
    adult: number;
    child: number;
    student: number;
  };
  status: string;
}

interface SearchResponse {
  trips: TripResult[];
  total: number;
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/** Formater une durée en minutes → "4h 30min" */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/** Extraire l'heure HH:MM depuis une ISO date string */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC", /* Burkina Faso = UTC±0 */
  });
}

/** Libellé lisible selon le type de bus */
const BUS_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  confort: "Confort",
  vip: "VIP",
  minibus: "Minibus",
};

const BUS_TYPE_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-700",
  confort: "bg-blue-100 text-blue-700",
  vip: "bg-amber-100 text-amber-700",
  minibus: "bg-purple-100 text-purple-700",
};

/* ============================================================
 * COMPOSANT CONTENU (a besoin de Suspense)
 * ============================================================ */

function VoyagesContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromCityId = searchParams.get("from") ?? "";
  const toCityId = searchParams.get("to") ?? "";
  const date = searchParams.get("date") ?? "";
  const passengers = parseInt(searchParams.get("passengers") ?? "1", 10);

  /* Requête de recherche — ne part que si les params sont présents */
  const { data, isLoading, isError, error } = useQuery<SearchResponse>({
    queryKey: ["transport-search", fromCityId, toCityId, date, passengers],
    queryFn: () =>
      apiClient.post<SearchResponse>("/transport/search", {
        origin_city_id: fromCityId,
        destination_city_id: toCityId,
        date,
        passengers,
      }),
    enabled: Boolean(fromCityId && toCityId && date),
    staleTime: 2 * 60 * 1000, /* 2 minutes — les dispo changent */
    retry: 1,
  });

  /* Formatage de la date pour l'affichage dans l'en-tête */
  const displayDate = date
    ? new Date(date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête avec résumé de la recherche */}
      <div className="bg-[#1A6B3A] px-4 pt-12 pb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-green-200 text-sm mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h1 className="text-white text-xl font-bold">
          {/* Noms des villes affichés via les données retournées par l'API */}
          Voyages disponibles
        </h1>
        {displayDate && (
          <p className="text-green-200 text-sm mt-1 capitalize">{displayDate}</p>
        )}
        {passengers > 1 && (
          <p className="text-green-200 text-xs mt-0.5">{passengers} passagers</p>
        )}
      </div>

      {/* Contenu principal */}
      <div className="px-4 py-4 space-y-3">

        {/* Chargement */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Erreur */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-700 font-semibold">Erreur de chargement</p>
            <p className="text-red-500 text-sm mt-1">
              {error instanceof Error ? error.message : "Impossible de charger les voyages"}
            </p>
          </div>
        )}

        {/* Aucun résultat */}
        {!isLoading && !isError && data?.trips.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="text-4xl mb-3">🚌</div>
            <p className="font-semibold text-gray-800">Aucun voyage disponible</p>
            <p className="text-sm text-gray-500 mt-1">
              Aucune compagnie ne dessert ce trajet à cette date.
            </p>
            <button
              onClick={() => router.back()}
              className="mt-4 text-[#1A6B3A] font-semibold text-sm"
            >
              Modifier la recherche
            </button>
          </div>
        )}

        {/* Compteur résultats */}
        {!isLoading && data && data.trips.length > 0 && (
          <p className="text-sm text-gray-500 font-medium">
            {data.total} voyage{data.total > 1 ? "s" : ""} trouvé{data.total > 1 ? "s" : ""}
          </p>
        )}

        {/* Liste des voyages */}
        {data?.trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onSelect={() => router.push(`/transport/voyages/${trip.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Carte d'un voyage
 * ============================================================ */

function TripCard({
  trip,
  onSelect,
}: {
  trip: TripResult;
  onSelect: () => void;
}): React.ReactElement {
  const depTime = formatTime(trip.departure_datetime);
  const arrTime = formatTime(trip.arrival_datetime);
  const duration = formatDuration(trip.duration_minutes);
  const busLabel = BUS_TYPE_LABELS[trip.route.bus_type] ?? trip.route.bus_type;
  const busColor = BUS_TYPE_COLORS[trip.route.bus_type] ?? "bg-gray-100 text-gray-700";

  const isAlmostFull = trip.available_seats <= 5;

  return (
    <button
      onClick={onSelect}
      className="w-full bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-left active:scale-[0.99]"
    >
      {/* Ligne 1 : Compagnie + Badge type bus */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 text-sm">{trip.company.name}</span>
          {/* Note de la compagnie */}
          {trip.company.rating_avg > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              ★ {trip.company.rating_avg.toFixed(1)}
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${busColor}`}>
          {busLabel}
        </span>
      </div>

      {/* Ligne 2 : Horaires départ → arrivée */}
      <div className="flex items-center gap-3 mb-2">
        {/* Heure de départ */}
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 leading-none">{depTime}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[90px]">
            {trip.route.origin_city}
          </p>
        </div>

        {/* Flèche avec durée */}
        <div className="flex-1 flex flex-col items-center">
          <p className="text-xs text-gray-400 mb-1">{duration}</p>
          <div className="w-full flex items-center gap-1">
            <div className="h-px flex-1 bg-gray-300" />
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 5l7 7m0 0l-7 7m7-7H3" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <p className="text-xs text-gray-400 mt-1">{trip.route.distance_km} km</p>
        </div>

        {/* Heure d'arrivée */}
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 leading-none">{arrTime}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[90px]">
            {trip.route.destination_city}
          </p>
        </div>
      </div>

      {/* Ligne 3 : Prix + Places disponibles */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div>
          <span className="text-xs text-gray-500">À partir de </span>
          <span className="text-[#1A6B3A] font-bold text-lg">
            {trip.prices.adult.toLocaleString("fr-FR")}
          </span>
          <span className="text-gray-500 text-xs"> FCFA</span>
        </div>
        <div className={`text-xs font-medium ${isAlmostFull ? "text-red-600" : "text-gray-500"}`}>
          {isAlmostFull
            ? `⚠ ${trip.available_seats} place${trip.available_seats > 1 ? "s" : ""} restante${trip.available_seats > 1 ? "s" : ""}`
            : `${trip.available_seats} places`}
        </div>
      </div>
    </button>
  );
}

/* ============================================================
 * DEFAULT EXPORT : wrappé dans Suspense pour useSearchParams()
 * ============================================================ */

export default function VoyagesPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Recherche en cours...</p>
          </div>
        </div>
      }
    >
      <VoyagesContent />
    </Suspense>
  );
}
