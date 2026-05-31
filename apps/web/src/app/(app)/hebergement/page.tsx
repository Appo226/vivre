"use client";

/**
 * hebergement/page.tsx — HE_001 : Page d'accueil Hébergement
 *
 * Point d'entrée du module hébergement. Permet à l'utilisateur de :
 *   1. Saisir une ville, des dates (arrivée/départ) et le nombre de voyageurs
 *   2. Appliquer des filtres optionnels (type d'hébergement, prix max, étoiles)
 *   3. Lancer la recherche → redirige vers /hebergement/resultats
 *
 * Types d'hébergement Burkina : hôtels classés (Azalaï, Laïco, Splendid),
 * auberges budget (~5 000 FCFA/nuit), campements ruraux (Nazinga, Tiébélé),
 * locations privées et hostels.
 *
 * Sans dates : affiche les hébergements populaires de la ville sélectionnée.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City {
  id: string;
  name: string;
}

interface PropertyPreview {
  id: string;
  name: string;
  property_type: string;
  address: string;
  star_rating: number | null;
  rating_avg: number | null;
  amenities: string[];
  min_price_per_night: number | null;
  city: { id: string; name: string };
}

/* ============================================================
 * DONNÉES STATIQUES
 * ============================================================ */

const PROPERTY_TYPES = [
  { value: "", label: "Tous types", icon: "🏨" },
  { value: "hotel", label: "Hôtel", icon: "🏩" },
  { value: "auberge", label: "Auberge", icon: "🏘️" },
  { value: "campement", label: "Campement", icon: "⛺" },
  { value: "private", label: "Location privée", icon: "🏠" },
  { value: "hostel", label: "Hostel", icon: "🛏️" },
];

const POPULAR_HOTELS = [
  { name: "Azalaï Indépendance", city: "Ouagadougou", type: "hotel", stars: 5 },
  { name: "Laïco Ouaga 2000", city: "Ouagadougou", type: "hotel", stars: 5 },
  { name: "Hôtel Splendid", city: "Ouagadougou", type: "hotel", stars: 4 },
  { name: "Campement Nazinga", city: "Pô", type: "campement", stars: 3 },
];

/* Formater le prix en FCFA */
function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function HebergementPage(): React.ReactElement {
  const router = useRouter();

  /* État du formulaire de recherche */
  const [cityId, setCityId] = useState("");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [guests, setGuests] = useState(2);
  const [propertyType, setPropertyType] = useState("");

  /* Données */
  const [cities, setCities] = useState<City[]>([]);
  const [popularProperties, setPopularProperties] = useState<PropertyPreview[]>([]);
  const [isLoadingPopular, setIsLoadingPopular] = useState(false);

  /* Date minimum = aujourd'hui */
  const today = new Date().toISOString().split("T")[0] as string;

  /* Charger les villes au montage */
  useEffect(() => {
    apiClient.get<{ cities: City[] }>("/cities").then((res) => {
      setCities(res.cities);
    }).catch(() => {/* Silencieux — l'utilisateur peut tout de même saisir */});
  }, []);

  /* Charger les hébergements populaires dès qu'une ville est sélectionnée */
  useEffect(() => {
    if (!cityId) {
      setPopularProperties([]);
      return;
    }

    setIsLoadingPopular(true);
    apiClient
      .get<{ properties: PropertyPreview[] }>(`/properties?city_id=${cityId}&limit=6`)
      .then((res) => setPopularProperties(res.properties))
      .catch(() => setPopularProperties([]))
      .finally(() => setIsLoadingPopular(false));
  }, [cityId]);

  /**
   * Lancer la recherche avec disponibilité.
   * Si dates non saisies, redirige vers la liste simple.
   */
  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    if (!cityId) return;

    const params = new URLSearchParams({ city_id: cityId, guests: String(guests) });
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (propertyType) params.set("property_type", propertyType);

    router.push(`/hebergement/resultats?${params.toString()}`);
  }

  /* Ajuster checkout si checkin changé : garantir checkout > checkin */
  function handleCheckinChange(value: string): void {
    setCheckin(value);
    if (checkout && checkout <= value) {
      /* Ajouter 1 nuit par défaut */
      const d = new Date(value);
      d.setDate(d.getDate() + 1);
      setCheckout(d.toISOString().split("T")[0] as string);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Hero — dégradé vert VIVRE avec formulaire de recherche */}
      <div className="bg-gradient-to-br from-[#1A6B3A] to-[#145530] pb-8 px-4 pt-10">
        <h1 className="text-white font-bold text-2xl mb-1">Hébergement</h1>
        <p className="text-white/70 text-sm mb-6">
          Hôtels, auberges, campements — à travers le Burkina
        </p>

        {/* Formulaire de recherche */}
        <form
          onSubmit={handleSearch}
          className="bg-white rounded-2xl p-4 shadow-xl space-y-3"
        >
          {/* Ville */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Ville
            </label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30"
              required
            >
              <option value="">Choisissez une ville...</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Arrivée
              </label>
              <input
                type="date"
                value={checkin}
                min={today}
                onChange={(e) => handleCheckinChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Départ
              </label>
              <input
                type="date"
                value={checkout}
                min={checkin || today}
                onChange={(e) => setCheckout(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30"
              />
            </div>
          </div>

          {/* Voyageurs + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Voyageurs
              </label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  className="w-10 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 text-lg font-bold"
                >−</button>
                <span className="flex-1 text-center text-sm font-semibold">{guests}</span>
                <button
                  type="button"
                  onClick={() => setGuests((g) => Math.min(20, g + 1))}
                  className="w-10 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 text-lg font-bold"
                >+</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Type
              </label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bouton recherche */}
          <button
            type="submit"
            disabled={!cityId}
            className="w-full bg-[#1A6B3A] text-white font-bold py-4 rounded-xl disabled:opacity-40 transition-all active:scale-95"
          >
            {checkin && checkout ? "Voir les disponibilités" : "Explorer les hébergements"}
          </button>
        </form>
      </div>

      {/* Contenu principal */}
      <div className="px-4 py-6 space-y-6">

        {/* Types d'hébergement — raccourcis visuels */}
        <section>
          <h2 className="font-bold text-gray-900 mb-3">Types d'hébergement</h2>
          <div className="grid grid-cols-3 gap-3">
            {PROPERTY_TYPES.filter((t) => t.value).map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setPropertyType(type.value);
                  if (cityId) {
                    const params = new URLSearchParams({ city_id: cityId, property_type: type.value });
                    router.push(`/hebergement/resultats?${params.toString()}`);
                  } else {
                    setPropertyType(type.value);
                  }
                }}
                className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100 active:scale-95 transition-all"
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <p className="text-xs font-semibold text-gray-700">{type.label}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Hébergements populaires (si ville sélectionnée) */}
        {cityId && (
          <section>
            <h2 className="font-bold text-gray-900 mb-3">
              {isLoadingPopular ? "Chargement..." : "Hébergements populaires"}
            </h2>
            {isLoadingPopular ? (
              /* Squelettes de chargement */
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : popularProperties.length > 0 ? (
              <div className="space-y-3">
                {popularProperties.map((prop) => (
                  <PropertyCard
                    key={prop.id}
                    property={prop}
                    onClick={() => router.push(`/hebergement/${prop.id}`)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                Aucun hébergement trouvé dans cette ville
              </p>
            )}
          </section>
        )}

        {/* Hébergements en vedette (statique — suggestions si pas de ville) */}
        {!cityId && (
          <section>
            <h2 className="font-bold text-gray-900 mb-3">Hébergements en vedette</h2>
            <div className="space-y-3">
              {POPULAR_HOTELS.map((hotel, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3"
                >
                  <div className="w-12 h-12 bg-[#1A6B3A]/10 rounded-xl flex items-center justify-center text-xl">
                    {hotel.type === "campement" ? "⛺" : "🏨"}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{hotel.name}</p>
                    <p className="text-xs text-gray-500">{hotel.city}</p>
                    <div className="flex gap-0.5 mt-0.5">
                      {Array.from({ length: hotel.stars }).map((_, s) => (
                        <span key={s} className="text-[#F5A623] text-xs">★</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT CARTE PROPRIÉTÉ
 * ============================================================ */

function PropertyCard({
  property,
  onClick,
}: {
  property: PropertyPreview;
  onClick: () => void;
}): React.ReactElement {
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === property.property_type);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.99] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-[#1A6B3A]/10 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
          {typeLabel?.icon ?? "🏨"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{property.name}</p>
            {property.rating_avg && (
              <span className="text-xs font-bold text-[#1A6B3A] flex-shrink-0">
                ★ {property.rating_avg.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{property.address}</p>
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-0.5">
              {property.star_rating && Array.from({ length: property.star_rating }).map((_, i) => (
                <span key={i} className="text-[#F5A623] text-xs">★</span>
              ))}
            </div>
            {property.min_price_per_night && (
              <p className="text-xs font-bold text-[#1A6B3A]">
                à partir de {formatFCFA(property.min_price_per_night)}/nuit
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
