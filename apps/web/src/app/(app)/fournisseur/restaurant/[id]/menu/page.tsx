"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/restaurant/[id]/menu — Gestion du menu
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  is_featured: boolean;
  prep_minutes: number | null;
}

interface MenuCategory {
  id: string;
  name: string;
  is_active: boolean;
  items: MenuItem[];
}

export default function RestaurantMenuPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) { router.push("/auth"); return; }
    try {
      const res = await apiClient.get<{ categories: MenuCategory[] }>(`/restaurants/${params.id}/menu`);
      setCategories(res.categories);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [params.id, accessToken, router]);

  useEffect(() => { void load(); }, [load]);

  async function toggleItem(itemId: string, currentAvail: boolean): Promise<void> {
    setToggling(itemId);
    try {
      await apiClient.patch(`/restaurants/${params.id}/items/${itemId}`, {
        is_available: !currentAvail,
      });
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.id === itemId ? { ...item, is_available: !currentAvail } : item
          ),
        }))
      );
    } catch { /* ignore */ } finally { setToggling(null); }
  }

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const availableItems = categories.reduce((s, c) => s + c.items.filter((i) => i.is_available).length, 0);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Menu</h1>
        </div>
      </header>

      {!loading && (
        <div className="px-4 pt-4 pb-2 flex gap-3">
          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-xl font-bold text-gray-900">{totalItems}</p>
            <p className="text-xs text-gray-500 font-dm">Plats total</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-xl font-bold text-green-700">{availableItems}</p>
            <p className="text-xs text-gray-500 font-dm">Disponibles</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-xl font-bold text-red-600">{totalItems - availableItems}</p>
            <p className="text-xs text-gray-500 font-dm">Épuisés</p>
          </div>
        </div>
      )}

      <div className="px-4 pt-2 space-y-4">
        {loading && [1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex justify-between items-center py-2 border-t border-gray-50">
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-6 w-12 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ))}

        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="font-jakarta font-semibold text-gray-900 text-sm">{cat.name}</p>
              <span className="text-xs text-gray-400 font-dm">{cat.items.length} plat{cat.items.length !== 1 ? "s" : ""}</span>
            </div>
            {cat.items.map((item, idx) => (
              <div
                key={item.id}
                className={[
                  "px-4 py-3 flex items-center justify-between gap-3",
                  idx < cat.items.length - 1 ? "border-b border-gray-50" : "",
                  !item.is_available ? "opacity-50" : "",
                ].join(" ")}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-dm text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 font-dm">{item.price.toLocaleString()} FCFA
                    {item.prep_minutes ? ` · ${item.prep_minutes} min` : ""}
                    {item.is_featured ? " · ⭐" : ""}
                  </p>
                </div>
                <button
                  onClick={() => void toggleItem(item.id, item.is_available)}
                  disabled={toggling === item.id}
                  className={[
                    "shrink-0 w-12 h-6 rounded-full transition-colors duration-200 relative disabled:opacity-50",
                    item.is_available ? "bg-green-500" : "bg-gray-300",
                  ].join(" ")}
                >
                  <span className={[
                    "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200",
                    item.is_available ? "left-6" : "left-0.5",
                  ].join(" ")} />
                </button>
              </div>
            ))}
          </div>
        ))}

        {!loading && categories.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-gray-500 font-dm text-sm">Aucun plat dans le menu.</p>
          </div>
        )}
      </div>
    </div>
  );
}
