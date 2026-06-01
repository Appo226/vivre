"use client";

export const dynamic = "force-dynamic";

/**
 * food/page.tsx — FD_001 : Accueil Food Delivery
 *
 * Liste les restaurants de la ville sélectionnée avec filtres :
 *   - Type d'établissement (restaurant, maquis, fastfood, bakery, street_food)
 *   - Ouvert maintenant (toggle)
 *   - Livraison / Click & collect
 *   - Recherche textuelle
 *
 * Contexte burkinabè : le "maquis" est l'établissement le plus commun —
 * petite restauration locale à 500-2000 FCFA le plat, souvent sans carte mais
 * avec quelques plats du jour. On lui donne la même visibilité que les restaurants.
 *
 * Le panier flottant en bas est partagé via useCartStore (Zustand).
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useCartStore } from "@/store/cart.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City {
  id: string;
  name: string;
}

interface RestaurantCard {
  id: string;
  name: string;
  restaurant_type: string;
  address: string;
  delivery_radius_km: number;
  min_order_fcfa: number;
  avg_prep_minutes: number;
  offers_delivery: boolean;
  offers_pickup: boolean;
  is_open_now: boolean;
  rating_avg: number;
  min_price: number | null;
  city: { id: string; name: string };
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const RESTAURANT_TYPES = [
  { value: "", label: "Tous", icon: "🍽️" },
  { value: "maquis", label: "Maquis", icon: "🫕" },
  { value: "restaurant", label: "Restaurant", icon: "🍴" },
  { value: "fastfood", label: "Fast food", icon: "🍔" },
  { value: "bakery", label: "Boulangerie", icon: "🥖" },
  { value: "street_food", label: "Street food", icon: "🌯" },
];

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function FoodPage(): React.ReactElement {
  const router = useRouter();
  const cartStore = useCartStore();

  /* Filtres */
  const [cityId, setCityId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [q, setQ] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"" | "delivery" | "pickup">("");

  /* Données */
  const [cities, setCities] = useState<City[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);

  /* Charger les villes au montage */
  useEffect(() => {
    apiClient.get<{ cities: City[] }>("/cities")
      .then((res) => { setCities(res.cities); })
      .catch(() => {});
  }, []);

  /* Recharger les restaurants à chaque changement de filtre */
  useEffect(() => {
    if (!cityId && !q) {
      setRestaurants([]);
      return;
    }

    setIsLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (cityId) params.set("city_id", cityId);
    if (typeFilter) params.set("restaurant_type", typeFilter);
    if (openNow) params.set("open_now", "true");
    if (q) params.set("q", q);
    if (deliveryMode === "delivery") params.set("offers_delivery", "true");
    if (deliveryMode === "pickup") params.set("offers_pickup", "true");

    apiClient
      .get<{ restaurants: RestaurantCard[]; total: number }>(`/restaurants?${params.toString()}`)
      .then((res) => { setRestaurants(res.restaurants); setTotal(res.total); })
      .catch(() => setRestaurants([]))
      .finally(() => setIsLoading(false));
  }, [cityId, typeFilter, openNow, q, deliveryMode]);

  const cartTotal = cartStore.totalItems();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hero dégradé */}
      <div className="bg-gradient-to-br from-[#EF2B2D] to-[#b01f21] px-4 pt-10 pb-6">
        <h1 className="text-white font-bold text-2xl mb-1">Food Delivery</h1>
        <p className="text-white/70 text-sm mb-4">Maquis, restaurants, street food — livré chez vous</p>

        {/* Barre de recherche */}
        <div className="bg-white rounded-2xl flex items-center px-4 gap-2 shadow-lg">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher un restaurant ou un plat..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 py-3.5 text-sm focus:outline-none bg-transparent"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-gray-400 text-lg">✕</button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Sélection de ville */}
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#EF2B2D]/30"
        >
          <option value="">Toutes les villes</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Filtres de type — scroll horizontal */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {RESTAURANT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setTypeFilter(type.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                typeFilter === type.value
                  ? "bg-[#EF2B2D] text-white border-[#EF2B2D]"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              <span>{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>

        {/* Filtres secondaires */}
        <div className="flex gap-2">
          {/* Toggle ouvert maintenant */}
          <button
            onClick={() => setOpenNow((v) => !v)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              openNow
                ? "bg-green-500 text-white border-green-500"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${openNow ? "bg-white" : "bg-green-400"}`} />
            Ouvert maintenant
          </button>

          {/* Mode livraison / retrait */}
          <button
            onClick={() => setDeliveryMode((v) => v === "delivery" ? "" : "delivery")}
            className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              deliveryMode === "delivery"
                ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            🛵 Livraison
          </button>

          <button
            onClick={() => setDeliveryMode((v) => v === "pickup" ? "" : "pickup")}
            className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              deliveryMode === "pickup"
                ? "bg-[#F5A623] text-white border-[#F5A623]"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            🏃 À emporter
          </button>
        </div>

        {/* Résultats */}
        <div>
          {(cityId || q) && !isLoading && (
            <p className="text-xs text-gray-400 mb-3">
              {total} restaurant{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}
            </p>
          )}

          {isLoading ? (
            /* Squelettes */
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm mb-3 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-100 rounded-full w-20" />
                  <div className="h-6 bg-gray-100 rounded-full w-24" />
                </div>
              </div>
            ))
          ) : restaurants.length === 0 && (cityId || q) ? (
            <div className="py-12 text-center">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="font-semibold text-gray-800">Aucun restaurant trouvé</p>
              <p className="text-sm text-gray-500 mt-1">
                {openNow ? "Essayez sans le filtre «Ouvert maintenant»" : "Modifiez vos critères de recherche"}
              </p>
            </div>
          ) : restaurants.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-5xl mb-4">🫕</p>
              <p className="font-semibold text-gray-800">Trouvez votre prochain repas</p>
              <p className="text-sm text-gray-500 mt-1">
                Sélectionnez une ville ou recherchez un restaurant
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {restaurants.map((r) => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  onClick={() => router.push(`/food/${r.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bulle de panier flottante */}
      {cartTotal > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-30">
          <button
            onClick={() => router.push("/food/panier")}
            className="w-full bg-[#EF2B2D] text-white font-bold py-4 rounded-2xl shadow-2xl flex items-center justify-between px-5 active:scale-[0.99] transition-all"
          >
            <span className="bg-white/20 rounded-xl px-3 py-1 text-sm font-bold">
              {cartTotal} article{cartTotal > 1 ? "s" : ""}
            </span>
            <span>Voir le panier →</span>
            <span className="font-bold">
              {formatFCFA(cartStore.subtotal())}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * CARTE RESTAURANT
 * ============================================================ */

function RestaurantCard({
  restaurant,
  onClick,
}: {
  restaurant: RestaurantCard;
  onClick: () => void;
}): React.ReactElement {
  const typeInfo = RESTAURANT_TYPES.find((t) => t.value === restaurant.restaurant_type);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.99] transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Icône type */}
        <div className="w-12 h-12 bg-[#EF2B2D]/10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
          {typeInfo?.icon ?? "🍽️"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-bold text-gray-900 text-sm leading-tight">{restaurant.name}</h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Indicateur ouvert/fermé */}
              <span className={`w-2 h-2 rounded-full ${restaurant.is_open_now ? "bg-green-500" : "bg-gray-300"}`} />
              {restaurant.rating_avg > 0 && (
                <span className="text-xs font-bold text-[#1A6B3A]">★ {restaurant.rating_avg.toFixed(1)}</span>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-2 truncate">{restaurant.address}</p>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
              ⏱ {restaurant.avg_prep_minutes} min
            </span>
            {restaurant.offers_delivery && (
              <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full">
                🛵 Livraison
              </span>
            )}
            {restaurant.offers_pickup && (
              <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                🏃 À emporter
              </span>
            )}
            {restaurant.min_order_fcfa > 0 && (
              <span className="bg-gray-50 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                Min {formatFCFA(restaurant.min_order_fcfa)}
              </span>
            )}
          </div>

          {restaurant.min_price && (
            <p className="text-xs text-[#EF2B2D] font-semibold mt-1.5">
              À partir de {formatFCFA(restaurant.min_price)}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
