"use client";

/**
 * components/CitySelector.tsx — Sélecteur de ville interactif
 *
 * Lit/écrit la ville sélectionnée depuis localStorage ("vivre_city").
 * Au montage, récupère la liste des villes depuis GET /v1/cities
 * et restaure la dernière ville choisie (ou Ouagadougou par défaut).
 * Au clic : ouvre un bottom-sheet listant toutes les villes disponibles.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";

const STORAGE_KEY = "vivre_city";
const DEFAULT_CITY = { id: "", name: "Ouagadougou" };

interface City {
  id: string;
  name: string;
}

interface CitiesResponse {
  cities: City[];
}

export default function CitySelector(): React.ReactElement {
  const [cities, setCities] = useState<City[]>([]);
  const [selected, setSelected] = useState<City>(DEFAULT_CITY);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    /* Charger les villes depuis l'API */
    apiClient
      .get<CitiesResponse>("/cities")
      .then((res) => {
        setCities(res.cities);
        /* Restaurer la ville sauvegardée */
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as City;
            setSelected(parsed);
          } catch {
            /* Ignorer les données corrompues */
          }
        } else if (res.cities.length > 0) {
          const ouaga = res.cities.find((c) => c.name === "Ouagadougou") ?? res.cities[0];
          if (ouaga) setSelected(ouaga);
        }
      })
      .catch(() => {
        /* Conserver la valeur par défaut si l'API est indisponible */
      });
  }, []);

  const handleSelect = useCallback((city: City) => {
    setSelected(city);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
    setOpen(false);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-green-100 text-sm mb-4"
        aria-label={`Ville sélectionnée : ${selected.name}. Appuyer pour changer.`}
      >
        <span>📍</span>
        <span className="font-dm">{selected.name}</span>
        <span>▾</span>
      </button>

      {/* Bottom-sheet modal de sélection de ville */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full rounded-t-3xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête du sheet */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-base font-sora font-bold text-gray-900">
                Choisir une ville
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 text-xl leading-none"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Liste des villes */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1">
              {cities.length === 0 && (
                /* Fallback si l'API est vide ou en erreur */
                <button
                  onClick={() => handleSelect(DEFAULT_CITY)}
                  className={[
                    "w-full text-left px-4 py-3 rounded-xl font-dm text-sm transition-colors",
                    selected.name === DEFAULT_CITY.name
                      ? "bg-green-50 text-green-800 font-semibold"
                      : "text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                >
                  📍 {DEFAULT_CITY.name}
                </button>
              )}
              {cities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleSelect(city)}
                  className={[
                    "w-full text-left px-4 py-3 rounded-xl font-dm text-sm transition-colors",
                    selected.id === city.id
                      ? "bg-green-50 text-green-800 font-semibold"
                      : "text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                >
                  📍 {city.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
