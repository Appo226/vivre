"use client";

/**
 * restaurants/page.tsx — Approbation des restaurants
 *
 * Affiche les restaurants en attente d'approbation (par défaut).
 * L'admin peut :
 *   - Approuver un restaurant → PATCH /restaurants/:id/approve
 *   - Basculer vers la liste des approuvés pour audit
 *
 * Les restaurants "pending" restent invisibles dans l'app client
 * jusqu'à approbation.
 *
 * Tri : plus anciens en premier (FIFO) pour les pending.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Restaurant {
  id:            string;
  name:          string;
  restaurant_type: string;
  address:       string;
  phone:         string;
  is_approved:   boolean;
  is_active:     boolean;
  created_at:    string;
  city:  { name: string };
  owner: { first_name: string | null; last_name: string | null; phone: string };
  _count: { menu_items: number };
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant", maquis: "Maquis", fastfood: "Fast-food",
  bakery: "Boulangerie", street_food: "Street food",
};

/* ============================================================
 * COMPOSANT INTERNE
 * ============================================================ */

function RestaurantsContent() {
  const params = useSearchParams();
  const { accessToken } = useAuthStore();

  const [activeStatus, setActiveStatus] = useState(params.get("status") ?? "pending");
  const [restaurants, setRestaurants]   = useState<Restaurant[]>([]);
  const [loading, setLoading]           = useState(true);
  const [approvingId, setApprovingId]   = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ restaurants: Restaurant[] }>(
        `/admin/restaurants?status=${activeStatus}`
      );
      setRestaurants(res.restaurants ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeStatus]);

  useEffect(() => { void load(); }, [load]);

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await apiClient.patch(`/restaurants/${id}/approve`);
      setRestaurants((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setApprovingId(null);
    }
  }

  const ownerName = (r: Restaurant) =>
    [r.owner.first_name, r.owner.last_name].filter(Boolean).join(" ") || r.owner.phone;

  const daysAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return diff === 0 ? "aujourd'hui" : `il y a ${diff} jour${diff > 1 ? "s" : ""}`;
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Restaurants</h1>
        <span className="text-sm text-gray-500">{restaurants.length} résultat{restaurants.length > 1 ? "s" : ""}</span>
      </div>

      {/* Filtre statut */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "pending",  label: "En attente" },
          { key: "approved", label: "Approuvés" },
          { key: "all",      label: "Tous" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeStatus === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : restaurants.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500">
            {activeStatus === "pending" ? "Aucun restaurant en attente" : "Aucun restaurant trouvé"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {restaurants.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{r.name}</p>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[r.restaurant_type] ?? r.restaurant_type}
                    </span>
                    {r.is_approved && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Approuvé</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">📍 {r.address} · {r.city.name}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>👤 {ownerName(r)} · {r.owner.phone}</span>
                    <span>📞 {r.phone}</span>
                    <span>🍽️ {r._count.menu_items} plat{r._count.menu_items > 1 ? "s" : ""} au menu</span>
                    <span>⏱ Inscrit {daysAgo(r.created_at)}</span>
                  </div>
                </div>
                {!r.is_approved && (
                  <button
                    onClick={() => void handleApprove(r.id)}
                    disabled={approvingId === r.id}
                    className="flex-shrink-0 px-5 py-2 bg-green-500 text-white text-sm font-bold rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    {approvingId === r.id ? "…" : "✓ Approuver"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RestaurantsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Chargement…</div>}>
      <RestaurantsContent />
    </Suspense>
  );
}
