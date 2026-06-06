"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface UrbanLine {
  id: string;
  line_number: string;
  line_name: string;
  operator_name: string;
  color_hex: string;
  fare_fcfa: number;
  frequency_minutes: number;
  stops_count: number;
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function TransportUrbainPage(): React.ReactElement {
  const router = useRouter();
  const [lines, setLines]     = useState<UrbanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    void apiClient
      .get<{ lines: UrbanLine[] }>("/urban-lines")
      .then((r) => setLines(r.lines))
      .finally(() => setLoading(false));
  }, []);

  const filtered = lines.filter(
    (l) =>
      l.line_number.toLowerCase().includes(search.toLowerCase()) ||
      l.line_name.toLowerCase().includes(search.toLowerCase()) ||
      l.operator_name.toLowerCase().includes(search.toLowerCase())
  );

  /* Grouper les lignes filtrées par opérateur */
  const grouped = useMemo(() => {
    const map = new Map<string, UrbanLine[]>();
    for (const line of filtered) {
      const key = line.operator_name;
      const existing = map.get(key);
      if (existing) {
        existing.push(line);
      } else {
        map.set(key, [line]);
      }
    }
    return map;
  }, [filtered]);

  const operators = Array.from(grouped.keys());

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500 text-xl">‹</button>
          <div>
            <h1 className="text-lg font-sora font-bold text-gray-900">Transport Urbain</h1>
            <p className="text-xs text-gray-400 font-dm">Lignes gérées par les opérateurs partenaires</p>
          </div>
        </div>

        {/* Recherche */}
        <div className="mt-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            placeholder="Rechercher une ligne ou un opérateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm font-dm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </header>

      {/* Note multi-opérateurs */}
      <div className="mx-4 mt-4 bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-xl">🚌</span>
        <div>
          <p className="text-sm font-jakarta font-semibold text-green-800">
            Transport urbain · Lignes gérées par les opérateurs partenaires
          </p>
          <p className="text-xs text-green-600 font-dm mt-0.5">
            Tarif par trajet affiché sur chaque ligne.
          </p>
        </div>
      </div>

      {/* Skeletons */}
      {loading && (
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse flex gap-3">
              <div className="w-12 h-12 bg-gray-200 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-2 bg-gray-100 rounded w-3/4" />
                <div className="h-2 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aucun résultat */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🚌</p>
          <p className="text-gray-400 font-dm text-sm">Aucune ligne trouvée.</p>
        </div>
      )}

      {/* Lignes groupées par opérateur */}
      {!loading && operators.map((operator) => (
        <div key={operator} className="px-4 pt-5">
          {/* En-tête de groupe opérateur */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-dm mb-2">
            {operator}
          </p>
          <div className="space-y-3">
            {grouped.get(operator)!.map((line) => (
              <Link
                key={line.id}
                href={`/transport/urbain/${line.id}`}
                className="bg-white rounded-xl p-4 flex gap-3 border border-gray-100 hover:border-green-200 transition-colors active:scale-[0.98] block"
              >
                {/* Badge ligne avec point coloré */}
                <div
                  className="w-12 h-12 rounded-xl flex-shrink-0 flex flex-col items-center justify-center shadow-sm"
                  style={{ backgroundColor: line.color_hex }}
                >
                  <span className="text-white text-xs font-sora font-bold leading-none">Ligne</span>
                  <span className="text-white text-sm font-sora font-bold leading-tight">
                    {line.line_number}
                  </span>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 font-jakarta truncate">
                    {line.line_name}
                  </p>
                  <p className="text-xs text-gray-400 font-dm">{line.operator_name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                    <span className="text-xs text-gray-600 font-dm font-medium">
                      {line.fare_fcfa.toLocaleString("fr-FR")} FCFA
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500 font-dm">
                      Toutes les {line.frequency_minutes} min
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500 font-dm">{line.stops_count} arrêts</span>
                  </div>
                </div>

                <span className="text-gray-300 self-center">›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
