"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Stop {
  id: string;
  name: string;
  sequence_order: number;
  latitude: number;
  longitude: number;
}

interface LineDetail {
  id: string;
  line_number: string;
  line_name: string;
  color_hex: string;
  fare_fcfa: number;
  frequency_minutes: number;
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function UrbanLineDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [line,    setLine]    = useState<LineDetail | null>(null);
  const [stops,   setStops]   = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    void apiClient
      .get<{ line: LineDetail; stops: Stop[] }>(`/urban-lines/${id}/stops`)
      .then((r) => {
        setLine(r.line);
        setStops(r.stops);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  function openMaps(stop: Stop): void {
    const url = `https://maps.google.com/?q=${stop.latitude},${stop.longitude}`;
    window.open(url, "_blank", "noopener");
  }

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-24">
        <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
          <div className="flex items-center gap-3 pt-4">
            <button onClick={() => router.back()} className="text-gray-500 text-xl">‹</button>
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
          </div>
        </header>
        <div className="px-4 pt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-gray-200" />
                <div className="w-0.5 flex-1 bg-gray-100 mt-1" />
              </div>
              <div className="flex-1 pb-4">
                <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !line) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-4xl">🚌</p>
        <p className="text-gray-500 font-dm">Ligne introuvable.</p>
        <button onClick={() => router.back()} className="text-green-700 font-jakarta text-sm font-semibold">
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header
        className="px-4 pt-safe-top pb-5 sticky top-0 z-10"
        style={{ backgroundColor: line.color_hex }}
      >
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-white/80 text-xl">‹</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-white/20 text-white text-xs font-sora font-bold px-2 py-0.5 rounded-full">
                Ligne {line.line_number}
              </span>
            </div>
            <h1 className="text-base font-sora font-bold text-white mt-0.5 truncate">
              {line.line_name}
            </h1>
          </div>
        </div>

        {/* Infos tarifaires */}
        <div className="flex gap-4 mt-3">
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-white/70 text-[10px] font-dm">Tarif</p>
            <p className="text-white font-sora font-bold text-sm">
              {line.fare_fcfa.toLocaleString("fr-FR")} FCFA
            </p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-white/70 text-[10px] font-dm">Fréquence</p>
            <p className="text-white font-sora font-bold text-sm">
              {line.frequency_minutes} min
            </p>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-white/70 text-[10px] font-dm">Arrêts</p>
            <p className="text-white font-sora font-bold text-sm">{stops.length}</p>
          </div>
        </div>
      </header>

      {/* Liste des arrêts — style "carte de métro" verticale */}
      <div className="px-4 pt-5">
        <p className="text-xs font-jakarta font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Itinéraire
        </p>

        <div className="relative">
          {stops.map((stop, index) => {
            const isFirst = index === 0;
            const isLast  = index === stops.length - 1;
            const isTerm  = isFirst || isLast;

            return (
              <div key={stop.id} className="flex gap-3 group">
                {/* Ligne verticale + pastille */}
                <div className="flex flex-col items-center w-8 flex-shrink-0">
                  <div
                    className={[
                      "rounded-full flex-shrink-0 border-2",
                      isTerm
                        ? "w-4 h-4 border-white shadow-md"
                        : "w-3 h-3 border-white/60",
                    ].join(" ")}
                    style={{ backgroundColor: line.color_hex }}
                  />
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1 min-h-[2rem]"
                      style={{ backgroundColor: `${line.color_hex}40` }}
                    />
                  )}
                </div>

                {/* Nom de l'arrêt */}
                <button
                  onClick={() => openMaps(stop)}
                  className={[
                    "flex-1 min-w-0 pb-4 text-left flex items-start justify-between",
                    "group-active:opacity-70 transition-opacity",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p
                      className={[
                        "font-jakarta leading-tight",
                        isTerm
                          ? "text-sm font-bold text-gray-900"
                          : "text-sm text-gray-700",
                      ].join(" ")}
                    >
                      {stop.name}
                    </p>
                    {isTerm && (
                      <span
                        className="text-[10px] font-dm font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block text-white"
                        style={{ backgroundColor: line.color_hex }}
                      >
                        {isFirst ? "Départ" : "Terminus"}
                      </span>
                    )}
                  </div>
                  {/* Icône GPS */}
                  <span className="text-gray-300 group-hover:text-gray-500 ml-2 text-xs mt-0.5 transition-colors flex-shrink-0">
                    📍
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note offline */}
      <div className="mx-4 mt-6 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2">
        <span className="text-sm mt-0.5">💡</span>
        <p className="text-xs text-blue-700 font-dm">
          Ces données sont disponibles hors-ligne. Touchez un arrêt pour l{"'"}ouvrir dans Google Maps.
        </p>
      </div>
    </div>
  );
}
