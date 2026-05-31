"use client";

/**
 * /fournisseur/restaurant — Hub restaurateur : liste des restaurants
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface MyRestaurant {
  id: string;
  name: string;
  restaurant_type: string;
  is_approved: boolean;
  is_active: boolean;
  rating_avg: number;
  city: { name: string };
  _count: { menu_items: number };
}

export default function FournisseurRestaurantPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [restaurants, setRestaurants] = useState<MyRestaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    apiClient
      .get<{ restaurants: MyRestaurant[] }>("/restaurants/mine")
      .then((r) => setRestaurants(r.restaurants))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken, router]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Mes restaurants</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {loading && [1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}

        {!loading && restaurants.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🍽️</p>
            <p className="text-gray-500 font-dm text-sm">Aucun restaurant enregistré.</p>
          </div>
        )}

        {restaurants.map((r) => (
          <div key={r.id} className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-jakarta font-bold text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-500 font-dm">{r.restaurant_type} · {r.city.name}</p>
              </div>
              <span className={[
                "text-xs font-dm px-2 py-0.5 rounded-full",
                r.is_approved ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700",
              ].join(" ")}>
                {r.is_approved ? "Approuvé" : "En attente"}
              </span>
            </div>
            <div className="flex gap-2 text-xs text-gray-500 font-dm">
              <span>⭐ {r.rating_avg.toFixed(1)}</span>
              <span>·</span>
              <span>{r._count.menu_items} plat{r._count.menu_items !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/fournisseur/restaurant/${r.id}/commandes`}
                className="flex-1 text-center bg-green-700 text-white text-sm font-jakarta font-semibold py-2.5 rounded-xl"
              >
                Commandes
              </Link>
              <Link
                href={`/fournisseur/restaurant/${r.id}/menu`}
                className="flex-1 text-center border border-gray-200 text-gray-700 text-sm font-jakarta font-semibold py-2.5 rounded-xl"
              >
                Menu
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
