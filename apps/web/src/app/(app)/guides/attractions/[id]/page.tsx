"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface AttractionDetail {
  id: string;
  name: string;
  name_en: string | null;
  category: string;
  description: string;
  description_en: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  entry_fee_fcfa: number;
  entry_fee_tourist: number | null;
  opening_hours: Record<string, string> | null;
  visit_duration_hours: number | null;
  best_season: string | null;
  is_unesco: boolean;
  is_featured: boolean;
  rating_avg: number;
  city: { id: string; name: string } | null;
}

interface NearGuide {
  id: string;
  bio: string;
  languages: string[];
  specialties: string[];
  daily_rate_fcfa: number;
  half_day_rate_fcfa: number | null;
  is_ontb_certified: boolean;
  rating_avg: number;
  experience_years: number | null;
  user: { first_name: string | null; last_name: string | null; avatar_url: string | null };
}

const DAYS_FR: Record<string, string> = {
  mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu",
  fri: "Ven", sat: "Sam", sun: "Dim",
};

const CATEGORY_ICONS: Record<string, string> = {
  nature: "🌿", culture: "🎭", heritage: "🏛️", event: "🎪", urban: "🏙️",
};

const CATEGORY_BG: Record<string, string> = {
  nature: "#E8F5E9", culture: "#FFF3E0", heritage: "#F3E5F5",
  event: "#FCE4EC", urban: "#E3F2FD",
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function AttractionDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [attraction, setAttraction] = useState<AttractionDetail | null>(null);
  const [guides,     setGuides]     = useState<NearGuide[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  useEffect(() => {
    void apiClient
      .get<{ attraction: AttractionDetail; guides: NearGuide[] }>(`/attractions/${params.id}`)
      .then((r) => {
        setAttraction(r.attraction);
        setGuides(r.guides);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-24">
        <div className="h-48 bg-gray-200 animate-pulse" />
        <div className="px-4 pt-5 space-y-3">
          <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
          <div className="h-20 bg-gray-100 rounded animate-pulse mt-4" />
        </div>
      </div>
    );
  }

  if (error || !attraction) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-4xl">🗺️</p>
        <p className="text-gray-500 font-dm">Attraction introuvable.</p>
        <button onClick={() => router.back()} className="text-green-700 font-jakarta text-sm font-semibold">
          Retour
        </button>
      </div>
    );
  }

  function openMaps(): void {
    window.open(
      `https://maps.google.com/?q=${attraction!.latitude},${attraction!.longitude}`,
      "_blank",
      "noopener"
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Hero */}
      <div
        className="relative h-52 flex flex-col items-center justify-center"
        style={{ backgroundColor: CATEGORY_BG[attraction.category] ?? "#F5F5F5" }}
      >
        <button
          onClick={() => router.back()}
          className="absolute top-safe-top left-4 mt-4 w-9 h-9 bg-white/80 rounded-full flex items-center justify-center text-gray-700 shadow-sm backdrop-blur-sm"
        >
          ‹
        </button>
        <span className="text-7xl">{CATEGORY_ICONS[attraction.category] ?? "🗺️"}</span>
        {attraction.is_featured && (
          <span className="absolute bottom-3 left-3 text-xs bg-amber-500 text-white font-jakarta font-bold px-2 py-1 rounded-full">
            ⭐ À ne pas manquer
          </span>
        )}
        {attraction.is_unesco && (
          <span className="absolute bottom-3 right-3 text-xs bg-blue-600 text-white font-jakarta font-bold px-2 py-1 rounded-full">
            UNESCO
          </span>
        )}
      </div>

      <div className="px-4 pt-5 space-y-5">
        {/* Titre + infos essentielles */}
        <div>
          <h1 className="text-xl font-sora font-bold text-gray-900">{attraction.name}</h1>
          {attraction.city && (
            <p className="text-sm text-gray-500 font-dm mt-0.5">📍 {attraction.city.name}</p>
          )}
          {attraction.rating_avg > 0 && (
            <p className="text-sm text-amber-500 font-dm mt-1">
              ⭐ {attraction.rating_avg.toFixed(1)}
            </p>
          )}
        </div>

        {/* Chips d'infos */}
        <div className="flex flex-wrap gap-2">
          <Chip
            icon="🎟️"
            label={attraction.entry_fee_fcfa === 0 ? "Entrée gratuite" : `${attraction.entry_fee_fcfa.toLocaleString("fr-FR")} FCFA`}
          />
          {attraction.visit_duration_hours && (
            <Chip icon="⏱️" label={`~${attraction.visit_duration_hours}h de visite`} />
          )}
          {attraction.best_season && (
            <Chip icon="📅" label={`Idéal : ${attraction.best_season}`} />
          )}
          {attraction.entry_fee_tourist && attraction.entry_fee_tourist !== attraction.entry_fee_fcfa && (
            <Chip icon="🌍" label={`Touristes : ${attraction.entry_fee_tourist.toLocaleString("fr-FR")} FCFA`} />
          )}
        </div>

        {/* Description */}
        <section>
          <h2 className="text-sm font-sora font-bold text-gray-900 mb-2">Description</h2>
          <p className="text-sm text-gray-600 font-dm leading-relaxed">{attraction.description}</p>
        </section>

        {/* Horaires */}
        {attraction.opening_hours && Object.keys(attraction.opening_hours).length > 0 && (
          <section>
            <h2 className="text-sm font-sora font-bold text-gray-900 mb-2">Horaires d{"'"}ouverture</h2>
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {Object.entries(attraction.opening_hours).map(([day, hours]) => (
                <div key={day} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-gray-700 font-jakarta">{DAYS_FR[day] ?? day}</span>
                  <span className="text-sm text-gray-600 font-dm">{hours}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bouton directions */}
        {attraction.address && (
          <button
            onClick={openMaps}
            className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-green-300 transition-colors"
          >
            <span className="text-xl">🗺️</span>
            <div className="flex-1 text-left">
              <p className="text-sm font-jakarta font-semibold text-gray-900">Itinéraire</p>
              <p className="text-xs text-gray-400 font-dm truncate">{attraction.address}</p>
            </div>
            <span className="text-gray-300">›</span>
          </button>
        )}

        {/* Guides disponibles */}
        {guides.length > 0 && (
          <section>
            <h2 className="text-sm font-sora font-bold text-gray-900 mb-3">
              Guides pour ce site ({guides.length})
            </h2>
            <div className="space-y-3">
              {guides.map((g) => {
                const name = [g.user.first_name, g.user.last_name].filter(Boolean).join(" ") || "Guide VIVRE";
                const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <Link
                    key={g.id}
                    href={`/guides/${g.id}`}
                    className="bg-white rounded-xl p-4 flex gap-3 border border-gray-100 hover:border-green-200 transition-colors active:scale-[0.98] block"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#1A6B3A]/10 flex items-center justify-center flex-shrink-0 text-[#1A6B3A] font-jakarta font-bold text-xs">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-jakarta font-semibold text-gray-900">{name}</p>
                        {g.is_ontb_certified && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-jakarta font-bold px-1.5 py-0.5 rounded-full">
                            ONTB ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-dm">{g.languages.join(", ")}</p>
                      <p className="text-xs text-green-700 font-dm font-medium mt-0.5">
                        {g.daily_rate_fcfa.toLocaleString("fr-FR")} FCFA/jour
                      </p>
                    </div>
                    <span className="text-gray-300 self-center">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Chip({ icon, label }: { icon: string; label: string }): React.ReactElement {
  return (
    <span className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 font-dm px-3 py-1.5 rounded-full">
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}
