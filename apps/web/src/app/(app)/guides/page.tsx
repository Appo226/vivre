"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Attraction {
  id: string;
  name: string;
  category: string;
  description: string;
  entry_fee_fcfa: number;
  visit_duration_hours: number | null;
  best_season: string | null;
  is_unesco: boolean;
  is_featured: boolean;
  rating_avg: number;
  city: { id: string; name: string } | null;
}

interface Guide {
  id: string;
  bio: string;
  languages: string[];
  specialties: string[];
  daily_rate_fcfa: number;
  half_day_rate_fcfa: number | null;
  is_ontb_certified: boolean;
  rating_avg: number;
  experience_years: number | null;
  city: { id: string; name: string };
  user: { first_name: string | null; last_name: string | null; avatar_url: string | null };
}

/* ============================================================
 * HELPERS
 * ============================================================ */

const CATEGORY_LABELS: Record<string, string> = {
  nature:   "Nature",
  culture:  "Culture",
  heritage: "Patrimoine",
  event:    "Événements",
  urban:    "Urbain",
};

const CATEGORY_ICONS: Record<string, string> = {
  nature:   "🌿",
  culture:  "🎭",
  heritage: "🏛️",
  event:    "🎪",
  urban:    "🏙️",
};

const CATEGORIES = ["nature", "culture", "heritage", "event", "urban"] as const;

/* ============================================================
 * PAGE
 * ============================================================ */

export default function GuidesPage(): React.ReactElement {
  const router = useRouter();

  const [featured,        setFeatured]       = useState<Attraction[]>([]);
  const [allAttractions,  setAllAttractions]  = useState<Attraction[]>([]);
  const [guides,          setGuides]          = useState<Guide[]>([]);
  const [activeCategory,  setActiveCategory]  = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    void Promise.all([
      apiClient.get<{ attractions: Attraction[] }>("/attractions/featured"),
      apiClient.get<{ guides: Guide[] }>("/guides?limit=10"),
    ]).then(([featRes, guideRes]) => {
      setFeatured(featRes.attractions);
      setGuides(guideRes.guides);
    }).finally(() => setLoading(false));
  }, []);

  /* Charger par catégorie quand le filtre change */
  useEffect(() => {
    const params = activeCategory ? `?category=${activeCategory}&limit=20` : "?limit=20";
    void apiClient
      .get<{ attractions: Attraction[] }>(`/attractions${params}`)
      .then((r) => setAllAttractions(r.attractions));
  }, [activeCategory]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-[#1A6B3A] px-4 pt-safe-top pb-8">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-white/70 text-xl">‹</button>
          <div>
            <h1 className="text-xl font-sora font-bold text-white">Guides & Attractions</h1>
            <p className="text-green-200 text-xs font-dm">Découvrez le Burkina Faso</p>
          </div>
        </div>
      </header>

      <div className="-mt-4 px-4 space-y-6">

        {/* === ATTRACTIONS EN VEDETTE === */}
        {(loading || featured.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-sora font-bold text-gray-900">À ne pas manquer</h2>
              <Link href="/guides?all=1" className="text-xs text-[#1A6B3A] font-jakarta font-semibold">
                Tout voir
              </Link>
            </div>

            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {loading
                ? [1, 2, 3].map((i) => (
                    <div key={i} className="flex-shrink-0 w-52 h-44 bg-white rounded-xl animate-pulse" />
                  ))
                : featured.map((a) => (
                    <AttractionCard key={a.id} attraction={a} />
                  ))}
            </div>
          </section>
        )}

        {/* === CATÉGORIES === */}
        <section>
          <h2 className="text-sm font-sora font-bold text-gray-900 mb-3">Explorer par thème</h2>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={[
                "flex-shrink-0 px-4 py-2 rounded-full text-xs font-jakarta font-semibold transition-colors",
                activeCategory === null
                  ? "bg-[#1A6B3A] text-white"
                  : "bg-white text-gray-600 border border-gray-200",
              ].join(" ")}
            >
              Tous
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "flex-shrink-0 px-4 py-2 rounded-full text-xs font-jakarta font-semibold transition-colors flex items-center gap-1",
                  activeCategory === cat
                    ? "bg-[#1A6B3A] text-white"
                    : "bg-white text-gray-600 border border-gray-200",
                ].join(" ")}
              >
                <span>{CATEGORY_ICONS[cat]}</span>
                <span>{CATEGORY_LABELS[cat]}</span>
              </button>
            ))}
          </div>

          {/* Grille attractions */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            {allAttractions.map((a) => (
              <AttractionGridCard key={a.id} attraction={a} />
            ))}
            {allAttractions.length === 0 && !loading && (
              <div className="col-span-2 text-center py-8 text-gray-400 font-dm text-sm">
                Aucune attraction dans cette catégorie.
              </div>
            )}
          </div>
        </section>

        {/* === GUIDES CERTIFIÉS === */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-sora font-bold text-gray-900">Guides certifiés</h2>
          </div>

          <div className="space-y-3">
            {loading
              ? [1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 h-24 animate-pulse" />
                ))
              : guides.map((g) => <GuideCard key={g.id} guide={g} />)}

            {!loading && guides.length === 0 && (
              <div className="text-center py-8 text-gray-400 font-dm text-sm">
                Aucun guide disponible pour le moment.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
 * SOUS-COMPOSANTS
 * ============================================================ */

function AttractionCard({ attraction: a }: { attraction: Attraction }): React.ReactElement {
  return (
    <Link
      href={`/guides/attractions/${a.id}`}
      className="flex-shrink-0 w-52 bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-green-200 transition-colors active:scale-[0.98] block"
    >
      {/* Placeholder couleur par catégorie */}
      <div
        className="w-full h-28 flex items-center justify-center text-5xl"
        style={{ backgroundColor: CATEGORY_BG[a.category] ?? "#F5F5F5" }}
      >
        {CATEGORY_ICONS[a.category] ?? "🗺️"}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-jakarta font-semibold text-gray-900 leading-tight line-clamp-2">
            {a.name}
          </p>
          {a.is_unesco && (
            <span className="flex-shrink-0 text-[10px] bg-amber-100 text-amber-700 font-jakarta font-bold px-1.5 py-0.5 rounded-full">
              UNESCO
            </span>
          )}
        </div>
        {a.city && (
          <p className="text-[10px] text-gray-400 font-dm mt-0.5">📍 {a.city.name}</p>
        )}
        <p className="text-[10px] text-green-700 font-dm font-medium mt-1">
          {a.entry_fee_fcfa === 0 ? "Entrée gratuite" : `${a.entry_fee_fcfa.toLocaleString("fr-FR")} FCFA`}
        </p>
      </div>
    </Link>
  );
}

function AttractionGridCard({ attraction: a }: { attraction: Attraction }): React.ReactElement {
  return (
    <Link
      href={`/guides/attractions/${a.id}`}
      className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-green-200 transition-colors active:scale-[0.98] block"
    >
      <div
        className="w-full h-20 flex items-center justify-center text-3xl"
        style={{ backgroundColor: CATEGORY_BG[a.category] ?? "#F5F5F5" }}
      >
        {CATEGORY_ICONS[a.category] ?? "🗺️"}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-jakarta font-semibold text-gray-900 leading-tight line-clamp-2">
          {a.name}
        </p>
        {a.city && (
          <p className="text-[10px] text-gray-400 font-dm mt-0.5">📍 {a.city.name}</p>
        )}
        <p className="text-[10px] text-green-700 font-dm mt-1">
          {a.entry_fee_fcfa === 0 ? "Gratuit" : `${a.entry_fee_fcfa.toLocaleString("fr-FR")} FCFA`}
        </p>
      </div>
    </Link>
  );
}

function GuideCard({ guide: g }: { guide: Guide }): React.ReactElement {
  const name = [g.user.first_name, g.user.last_name].filter(Boolean).join(" ") || "Guide VIVRE";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/guides/${g.id}`}
      className="bg-white rounded-xl p-4 flex gap-3 border border-gray-100 hover:border-green-200 transition-colors active:scale-[0.98] block"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-[#1A6B3A]/10 flex items-center justify-center flex-shrink-0 text-[#1A6B3A] font-jakarta font-bold text-sm">
        {initials}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-jakarta font-semibold text-gray-900 truncate">{name}</p>
          {g.is_ontb_certified && (
            <span className="flex-shrink-0 text-[10px] bg-blue-100 text-blue-700 font-jakarta font-bold px-1.5 py-0.5 rounded-full">
              ONTB ✓
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 font-dm">
          {g.city.name} · {g.languages.join(", ")}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-600 font-dm">
            {g.daily_rate_fcfa.toLocaleString("fr-FR")} FCFA/jour
          </span>
          {g.rating_avg > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-amber-500 font-dm">⭐ {g.rating_avg.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>

      <span className="text-gray-300 self-center">›</span>
    </Link>
  );
}

/* Fond pâle par catégorie */
const CATEGORY_BG: Record<string, string> = {
  nature:   "#E8F5E9",
  culture:  "#FFF3E0",
  heritage: "#F3E5F5",
  event:    "#FCE4EC",
  urban:    "#E3F2FD",
};
