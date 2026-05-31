"use client";

/**
 * transport/page.tsx — TI_001 : Écran recherche transport interurbain
 *
 * Permet à l'utilisateur de chercher un voyage entre deux villes du Burkina.
 * Corridors principaux : Ouaga ↔ Bobo (300km/4h), Ouaga ↔ Fada (220km/3h),
 * Ouaga ↔ Ouahigouya (180km/2h30), Ouaga ↔ Banfora (370km/5h).
 *
 * Données : les villes sont récupérées une fois et mises en cache (staleTime 1h).
 * La sélection déclenche une navigation vers /transport/voyages avec les params en URL.
 *
 * État :
 *   - from/to : villes sélectionnées via selects natifs HTML
 *   - date : sélecteur de date (min = aujourd'hui)
 *   - passengers : spinner 1-9
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City {
  id: string;
  name: string;
  has_transport: boolean;
}

interface CitiesResponse {
  cities: City[];
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function TransportPage(): React.ReactElement {
  const router = useRouter();

  /* Date du jour au format YYYY-MM-DD pour le min du date picker */
  const today = new Date().toISOString().split("T")[0] as string;

  const [fromCityId, setFromCityId] = useState<string>("");
  const [toCityId, setToCityId] = useState<string>("");
  const [date, setDate] = useState<string>(today);
  const [passengers, setPassengers] = useState<number>(1);

  /* Charger les villes qui ont le transport interurbain activé */
  const { data, isLoading } = useQuery<CitiesResponse>({
    queryKey: ["cities", "transport"],
    queryFn: () => apiClient.get<CitiesResponse>("/cities?has_transport=true"),
    staleTime: 60 * 60 * 1000, /* 1 heure — les villes changent rarement */
  });

  const cities = data?.cities ?? [];
  /* Trier par nom pour une liste lisible */
  const sortedCities = [...cities].sort((a, b) => a.name.localeCompare(b.name));

  /**
   * Soumettre la recherche.
   * Redirige vers /transport/voyages avec les paramètres en query string
   * pour que la page résultats puisse les lire via useSearchParams().
   */
  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();

    if (!fromCityId || !toCityId) return;
    if (fromCityId === toCityId) return;

    const params = new URLSearchParams({
      from: fromCityId,
      to: toCityId,
      date,
      passengers: String(passengers),
    });

    router.push(`/transport/voyages?${params.toString()}`);
  }

  /**
   * Inverser les villes origine/destination d'un clic.
   * Pratique pour chercher le voyage retour rapidement.
   */
  function swapCities(): void {
    const temp = fromCityId;
    setFromCityId(toCityId);
    setToCityId(temp);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête avec illustration */}
      <div className="bg-[#1A6B3A] px-4 pt-12 pb-24">
        <h1 className="text-white text-2xl font-bold font-['Sora']">
          Transport Interurbain
        </h1>
        <p className="text-green-200 text-sm mt-1">
          Réservez votre billet de bus en quelques secondes
        </p>
      </div>

      {/* Formulaire de recherche flottant */}
      <div className="px-4 -mt-16">
        <form
          onSubmit={handleSearch}
          className="bg-white rounded-2xl shadow-lg p-5 space-y-4"
        >
          {/* Ville de départ */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Départ
            </label>
            <select
              value={fromCityId}
              onChange={(e) => setFromCityId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1A6B3A] appearance-none"
              required
              disabled={isLoading}
            >
              <option value="">
                {isLoading ? "Chargement..." : "Sélectionner la ville de départ"}
              </option>
              {sortedCities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton swap */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={swapCities}
              className="w-10 h-10 rounded-full bg-green-50 border border-green-200 flex items-center justify-center hover:bg-green-100 transition-colors"
              aria-label="Inverser départ et destination"
            >
              {/* Icône double flèche verticale */}
              <svg className="w-5 h-5 text-[#1A6B3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Ville de destination */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Destination
            </label>
            <select
              value={toCityId}
              onChange={(e) => setToCityId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1A6B3A] appearance-none"
              required
              disabled={isLoading}
            >
              <option value="">
                {isLoading ? "Chargement..." : "Sélectionner la destination"}
              </option>
              {sortedCities
                .filter((c) => c.id !== fromCityId) /* Exclure la ville de départ */
                .map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Date + Passagers sur la même ligne */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Passagers
              </label>
              <div className="mt-1 flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                  className="px-3 py-3 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none"
                >
                  −
                </button>
                <span className="flex-1 text-center font-semibold text-gray-900">
                  {passengers}
                </span>
                <button
                  type="button"
                  onClick={() => setPassengers((p) => Math.min(9, p + 1))}
                  className="px-3 py-3 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Bouton Rechercher */}
          <button
            type="submit"
            disabled={!fromCityId || !toCityId || fromCityId === toCityId}
            className="w-full bg-[#1A6B3A] text-white font-semibold py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#155830] active:scale-95 transition-all text-base"
          >
            Rechercher les voyages
          </button>
        </form>
      </div>

      {/* Section compagnies partenaires */}
      <div className="px-4 mt-8">
        <h2 className="font-semibold text-gray-800 mb-3">Nos compagnies partenaires</h2>
        <CompaniesStrip />
      </div>

      {/* Bus urbain SOTRACO */}
      <div className="px-4 mt-6">
        <a
          href="/transport/urbain"
          className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-blue-100"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl">🚌</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Bus urbain SOTRACO</p>
            <p className="text-xs text-gray-500 mt-0.5">Lignes de bus à Ouagadougou</p>
          </div>
          <span className="text-gray-400">›</span>
        </a>
      </div>

      {/* Section corridors populaires */}
      <div className="px-4 mt-6 mb-8">
        <h2 className="font-semibold text-gray-800 mb-3">Corridors populaires</h2>
        <div className="space-y-3">
          {POPULAR_ROUTES.map((route) => (
            <button
              key={route.label}
              type="button"
              className="w-full flex items-center justify-between bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
              onClick={() => {
                /* Présélectionner le corridor et soumettre si les IDs sont connus */
                router.push(
                  `/transport/voyages?from=${route.from}&to=${route.to}&date=${today}&passengers=1`
                );
              }}
            >
              <div>
                <span className="font-semibold text-gray-900">{route.label}</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  {route.distance} • {route.duration}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[#1A6B3A] font-bold text-sm">
                  dès {route.price}
                </span>
                <p className="text-xs text-gray-400">FCFA</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Bande des compagnies partenaires
 * ============================================================ */

function CompaniesStrip(): React.ReactElement {
  const { data, isLoading } = useQuery<{ companies: { id: string; name: string }[] }>({
    queryKey: ["transport-companies"],
    queryFn: () => apiClient.get<{ companies: { id: string; name: string }[] }>("/transport/companies"),
    staleTime: 30 * 60 * 1000, /* 30 minutes */
  });

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  const companies = data?.companies ?? [];
  /* Afficher les initiales de chaque compagnie si pas de logo */
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {companies.map((company) => (
        <div
          key={company.id}
          className="flex-shrink-0 bg-white border border-gray-200 rounded-lg px-4 py-2 flex items-center"
        >
          <span className="text-sm font-semibold text-gray-700">{company.name}</span>
        </div>
      ))}
      {companies.length === 0 && (
        /* Placeholder si aucune compagnie n'est encore enregistrée en base */
        <p className="text-sm text-gray-400">Aucune compagnie partenaire pour le moment</p>
      )}
    </div>
  );
}

/* ============================================================
 * DONNÉES STATIQUES : Corridors populaires
 * Les from/to sont des slugs symboliques — en production ils seraient
 * remplacés par les vrais UUIDs des villes (ou une recherche par nom).
 * Pour le MVP, ces boutons redirigent vers les résultats avec les params.
 * ============================================================ */

const POPULAR_ROUTES = [
  {
    label: "Ouagadougou → Bobo-Dioulasso",
    from: "ouagadougou",
    to: "bobo-dioulasso",
    distance: "300 km",
    duration: "~4h",
    price: "3 500",
  },
  {
    label: "Ouagadougou → Fada N'Gourma",
    from: "ouagadougou",
    to: "fada",
    distance: "220 km",
    duration: "~3h",
    price: "2 500",
  },
  {
    label: "Ouagadougou → Ouahigouya",
    from: "ouagadougou",
    to: "ouahigouya",
    distance: "180 km",
    duration: "~2h30",
    price: "2 000",
  },
  {
    label: "Ouagadougou → Banfora",
    from: "ouagadougou",
    to: "banfora",
    distance: "370 km",
    duration: "~5h",
    price: "4 000",
  },
];
