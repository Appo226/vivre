"use client";

/**
 * components/LocationPicker.tsx — Sélection du lieu exact d'un événement.
 *
 * Recherche gratuite via Nominatim (OpenStreetMap, proxée par /api/geocode) puis un pin
 * ajustable à la main sur une carte MapLibre (tuiles gratuites OpenFreeMap — aucune clé
 * API, aucun coût, contrairement à Google Maps). L'admin voit ensuite ce même pin pendant
 * la revue d'un événement payant — ça donne un vrai repère visuel, pas juste une adresse en texte.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

interface GeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
}

interface LocationPickerProps {
  initialQuery?: string;
  value: { latitude: number; longitude: number } | null;
  onChange: (position: { latitude: number; longitude: number }) => void;
}

const DEFAULT_CENTER = {
  latitude: Number(process.env["NEXT_PUBLIC_DEFAULT_LAT"] ?? "12.3647"),
  longitude: Number(process.env["NEXT_PUBLIC_DEFAULT_LNG"] ?? "-1.5338"),
};
const MAP_STYLE = process.env["NEXT_PUBLIC_MAPLIBRE_STYLE"] ?? "https://tiles.openfreemap.org/styles/liberty";

export function LocationPicker({ initialQuery, value, onChange }: LocationPickerProps): React.ReactElement {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapRef | null>(null);

  const center = value ?? DEFAULT_CENTER;

  function useCurrentPosition(): void {
    if (!navigator.geolocation) {
      setSearchError("Localisation non disponible sur cet appareil");
      return;
    }
    setLocating(true);
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
      },
      () => {
        setLocating(false);
        setSearchError("Position refusée ou indisponible — cherchez l'adresse ou touchez la carte");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const search = useCallback(async () => {
    if (query.trim().length < 3) {
      setSearchError("Saisissez au moins 3 caractères");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { results: GeocodeResult[] };
      setResults(data.results);
      if (data.results.length === 0) {
        setSearchError("Aucun résultat — ajustez le pin manuellement sur la carte");
      }
    } catch {
      setSearchError("Recherche indisponible — ajustez le pin manuellement");
    } finally {
      setSearching(false);
    }
  }, [query]);

  function pickResult(result: GeocodeResult) {
    onChange({ latitude: result.latitude, longitude: result.longitude });
    setResults([]);
    mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 15 });
  }

  useEffect(() => {
    if (!value) return;
    mapRef.current?.flyTo({ center: [value.longitude, value.latitude], zoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={useCurrentPosition}
        disabled={locating}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-700 text-white text-sm font-jakarta font-semibold disabled:opacity-50"
      >
        <span aria-hidden="true">📍</span>
        {locating ? "Localisation en cours…" : "Je suis sur place — utiliser ma position"}
      </button>

      <p className="text-xs text-ink-soft text-center">— ou —</p>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())}
          placeholder="Rechercher le lieu (ex : Stade du 4-Août, Ouagadougou)"
          className="flex-1 border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-surface-card"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="px-4 rounded-xl bg-gray-900 text-white text-sm font-jakarta font-semibold disabled:opacity-50"
        >
          {searching ? "…" : "Chercher"}
        </button>
      </div>

      {searchError && <p className="text-xs text-amber-600">{searchError}</p>}

      {results.length > 0 && (
        <ul className="border border-border-subtle rounded-xl divide-y divide-gray-100 overflow-hidden">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pickResult(r)}
                className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl overflow-hidden border border-border-subtle h-56">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: center.longitude, latitude: center.latitude, zoom: value ? 15 : 12 }}
          mapStyle={MAP_STYLE}
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => onChange({ latitude: e.lngLat.lat, longitude: e.lngLat.lng })}
        >
          {value && (
            <Marker
              longitude={value.longitude}
              latitude={value.latitude}
              draggable
              onDragEnd={(e) => onChange({ latitude: e.lngLat.lat, longitude: e.lngLat.lng })}
            >
              <span className="text-3xl -translate-y-1/2 block" aria-hidden="true">📍</span>
            </Marker>
          )}
        </Map>
      </div>
      <p className="text-xs text-ink-soft">
        {value
          ? "Glissez le repère pour ajuster précisément l'emplacement."
          : "Cherchez une adresse ou touchez la carte pour placer le repère."}
      </p>
    </div>
  );
}
