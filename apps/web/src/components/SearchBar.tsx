"use client";

/**
 * components/SearchBar.tsx — Recherche universelle VIVRE
 *
 * Barre de recherche avec résultats groupés en dropdown.
 * Debounce 300ms → GET /v1/search?q=&city_id=
 * Résultats groupés : Restaurants · Hôtels · Événements · Transport · Services
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ============================================================
 * TYPES
 * ============================================================ */

interface SearchResult {
  id: string;
  type: "restaurant" | "property" | "event" | "transport" | "service";
  title: string;
  subtitle: string;
  meta: string | null;
  city: string;
  href: string;
  rating?: number;
  phone?: string;
  cover_url?: string;
}

interface SearchResponse {
  q: string;
  total: number;
  results: {
    restaurants: SearchResult[];
    properties: SearchResult[];
    events: SearchResult[];
    transport: SearchResult[];
    services: SearchResult[];
  };
}

/* ============================================================
 * ICÔNES PAR TYPE
 * ============================================================ */

const TYPE_ICON: Record<SearchResult["type"], string> = {
  restaurant: "🍽️",
  property: "🏨",
  event: "🎟️",
  transport: "🚌",
  service: "🏥",
};

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  restaurant: "Restaurant",
  property: "Hébergement",
  event: "Événement",
  transport: "Transport",
  service: "Service public",
};

/* ============================================================
 * COMPOSANT
 * ============================================================ */

interface SearchBarProps {
  cityId?: string;
}

export default function SearchBar({ cityId }: SearchBarProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  /* Close on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* Debounced search */
  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults(null);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const base = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";
        const params = new URLSearchParams({ q });
        if (cityId) params.set("city_id", cityId);
        const res = await fetch(`${base}/search?${params.toString()}`);
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as SearchResponse;
        setResults(data);
        setOpen(data.total > 0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [cityId]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void search(val), 300);
  }

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  /* Flatten all results in order for keyboard nav simplicity */
  const allGroups: { label: string; items: SearchResult[] }[] = results
    ? [
        { label: "Restaurants", items: results.results.restaurants },
        { label: "Hébergements", items: results.results.properties },
        { label: "Événements", items: results.results.events },
        { label: "Transport", items: results.results.transport },
        { label: "Services", items: results.results.services },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={handleChange}
          onFocus={() => results && results.total > 0 && setOpen(true)}
          placeholder="Rechercher hôtels, restaurants, bus..."
          className={[
            "w-full h-12 px-4 pl-10",
            "bg-white rounded-card text-gray-900",
            "font-dm text-sm placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-green-300",
          ].join(" ")}
          autoComplete="off"
          aria-label="Recherche universelle"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <span className="absolute left-3 top-3.5 text-gray-400">
          {loading ? <SpinnerIcon /> : "🔍"}
        </span>
        {query && (
          <button
            onClick={() => { setQuery(""); setResults(null); setOpen(false); }}
            className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 text-sm"
            aria-label="Effacer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && allGroups.length > 0 && (
        <div
          className={[
            "absolute left-0 right-0 top-full mt-1 z-50",
            "bg-white rounded-xl shadow-xl border border-gray-100",
            "max-h-[70vh] overflow-y-auto",
          ].join(" ")}
          role="listbox"
        >
          {allGroups.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <div className="px-3 pt-2 pb-1">
                <span className="text-xs font-jakarta font-semibold text-gray-400 uppercase tracking-wide">
                  {group.label}
                </span>
              </div>
              {/* Items */}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.href)}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2.5",
                    "hover:bg-gray-50 transition-colors text-left",
                  ].join(" ")}
                  role="option"
                >
                  <span className="text-xl shrink-0 w-8 text-center">
                    {TYPE_ICON[item.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-jakarta font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs font-dm text-gray-500 truncate">
                      {TYPE_LABEL[item.type]}
                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                      {" · "}
                      {item.city}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.rating !== undefined && item.rating > 0 && (
                      <span className="text-xs text-amber-500 font-dm">
                        ★ {item.rating.toFixed(1)}
                      </span>
                    )}
                    {item.meta && (
                      <p className="text-xs text-gray-400 font-dm">{item.meta}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-dm text-center">
              {results?.total} résultat{(results?.total ?? 0) > 1 ? "s" : ""} pour «{query}»
            </p>
          </div>
        </div>
      )}

      {/* No results state */}
      {open === false && query.length >= 2 && !loading && results?.total === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 px-4 py-6 text-center">
          <p className="text-sm text-gray-500 font-dm">
            Aucun résultat pour «{query}»
          </p>
          <p className="text-xs text-gray-400 font-dm mt-1">
            Essayez un autre terme ou consultez les catégories.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * SPINNER
 * ============================================================ */

function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      className="animate-spin w-4 h-4 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
