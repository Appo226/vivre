"use client";

/**
 * components/MarketingBanners.tsx — Bannières marketing dynamiques
 *
 * Au montage :
 * 1. Lit la ville sauvegardée dans localStorage ("vivre_city")
 * 2. Récupère les événements à venir   GET /v1/events?limit=3&city_id=…&upcoming=true
 * 3. Récupère les attractions proches  GET /v1/attractions?limit=2&city_id=…
 * Si l'API retourne des données, affiche des cartes dynamiques.
 * Sinon, affiche les 3 bannières promotionnelles statiques.
 */

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

const STORAGE_KEY = "vivre_city";

/* ============================================================
 * TYPES
 * ============================================================ */

interface ApiEvent {
  id: string;
  name: string;
  starts_at: string;
  price_fcfa: number | null;
}

interface ApiAttraction {
  id: string;
  name: string;
  short_description: string | null;
}

interface EventsResponse {
  events: ApiEvent[];
}

interface AttractionsResponse {
  attractions: ApiAttraction[];
}

/* ============================================================
 * BANNIÈRES STATIQUES (fallback)
 * ============================================================ */

function StaticBanners(): React.ReactElement {
  return (
    <>
      <a
        href="/course"
        className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#1A6B3A] to-[#0f4222] text-white shadow-md active:scale-95 transition-all"
      >
        <p className="text-2xl mb-1">🚗</p>
        <p className="font-sora font-bold text-sm leading-tight">Première course offerte</p>
        <p className="text-green-200 text-xs mt-1 font-dm">Code : VIVRE1</p>
      </a>
      <a
        href="/food"
        className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#EF2B2D] to-[#b85c00] text-white shadow-md active:scale-95 transition-all"
      >
        <p className="text-2xl mb-1">🍽️</p>
        <p className="font-sora font-bold text-sm leading-tight">Livraison gratuite</p>
        <p className="text-red-100 text-xs mt-1 font-dm">Restaurants partenaires</p>
      </a>
      <a
        href="/hebergement"
        className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#1A1A2E] to-[#2d4a1e] text-white shadow-md active:scale-95 transition-all"
      >
        <p className="text-2xl mb-1">🏨</p>
        <p className="font-sora font-bold text-sm leading-tight">-20% hébergement</p>
        <p className="text-green-200 text-xs mt-1 font-dm">Ce weekend seulement</p>
      </a>
    </>
  );
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function MarketingBanners(): React.ReactElement {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [attractions, setAttractions] = useState<ApiAttraction[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* Lire la ville depuis le localStorage */
    let cityId = "";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { id?: string };
        cityId = parsed.id ?? "";
      }
    } catch {
      /* Ignorer */
    }

    const cityParam = cityId ? `&city_id=${encodeURIComponent(cityId)}` : "";

    const fetchEvents = apiClient
      .get<EventsResponse>(`/events?limit=3${cityParam}&upcoming=true`)
      .then((res) => setEvents(res.events))
      .catch(() => {});

    const fetchAttractions = apiClient
      .get<AttractionsResponse>(`/attractions?limit=2${cityParam}`)
      .then((res) => setAttractions(res.attractions))
      .catch(() => {});

    Promise.allSettled([fetchEvents, fetchAttractions]).finally(() => setReady(true));
  }, []);

  /* Détecter si on a des données dynamiques à montrer */
  const hasDynamic = events.length > 0 || attractions.length > 0;

  return (
    <section className="px-4 pt-5 pb-1">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {/* Toujours afficher les bannières statiques en premier */}
        <StaticBanners />

        {/* Cartes d'événements dynamiques */}
        {ready && hasDynamic && events.map((event) => (
          <a
            key={event.id}
            href={`/evenements/${event.id}`}
            className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#F5A623] to-[#c47d0a] text-white shadow-md active:scale-95 transition-all"
          >
            <p className="text-2xl mb-1">🎟️</p>
            <p className="font-sora font-bold text-sm leading-tight line-clamp-2">{event.name}</p>
            <p className="text-yellow-100 text-xs mt-1 font-dm">
              {new Date(event.starts_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
              {" · "}
              {event.price_fcfa === 0 || event.price_fcfa === null
                ? "Gratuit"
                : `${event.price_fcfa.toLocaleString("fr-FR")} FCFA`}
            </p>
          </a>
        ))}

        {/* Cartes d'attractions dynamiques */}
        {ready && hasDynamic && attractions.map((attraction) => (
          <a
            key={attraction.id}
            href={`/guides/attractions/${attraction.id}`}
            className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#1A1A2E] to-[#003DA6] text-white shadow-md active:scale-95 transition-all"
          >
            <p className="text-2xl mb-1">🗺️</p>
            <p className="font-sora font-bold text-sm leading-tight line-clamp-2">{attraction.name}</p>
            {attraction.short_description && (
              <p className="text-blue-200 text-xs mt-1 font-dm line-clamp-2">
                {attraction.short_description}
              </p>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
