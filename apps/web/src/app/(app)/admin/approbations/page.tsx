"use client";

/**
 * /admin/approbations — Approbation des restaurants, hébergements et événements
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Tab = "restaurants" | "properties" | "events";

interface Restaurant {
  id: string;
  name: string;
  restaurant_type: string;
  address: string;
  phone: string;
  created_at: string;
  city: { name: string };
  owner: { first_name: string; last_name: string; phone: string };
  _count: { menu_items: number };
}

interface Property {
  id: string;
  name: string;
  property_type: string;
  address: string;
  star_rating: number | null;
  created_at: string;
  city: { name: string };
  owner: { first_name: string; last_name: string; phone: string };
  _count: { room_types: number };
}

interface Event {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  venue_name: string;
  created_at: string;
  city: { name: string };
  organizer: { first_name: string; last_name: string; phone: string };
  _count: { bookings: number };
}

export default function AdminApprobationsPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [tab, setTab] = useState<Tab>("restaurants");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [properties, setProperties]   = useState<Property[]>([]);
  const [events, setEvents]           = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    if (!accessToken) { router.push("/auth"); return; }
    setLoading(true);
    try {
      if (t === "restaurants") {
        const r = await apiClient.get<{ restaurants: Restaurant[] }>("/admin/restaurants?status=pending");
        setRestaurants(r.restaurants);
      } else if (t === "properties") {
        const r = await apiClient.get<{ properties: Property[] }>("/admin/properties?status=pending");
        setProperties(r.properties);
      } else {
        const r = await apiClient.get<{ events: Event[] }>("/admin/events?status=pending_approval");
        setEvents(r.events);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [accessToken, router]);

  useEffect(() => { void load(tab); }, [tab, load]);

  async function approveRestaurant(id: string): Promise<void> {
    setActing(id);
    try {
      await apiClient.patch(`/restaurants/${id}/approve`, {});
      setRestaurants((prev) => prev.filter((r) => r.id !== id));
    } catch { /* ignore */ } finally { setActing(null); }
  }

  async function approveProperty(id: string): Promise<void> {
    setActing(id);
    try {
      await apiClient.patch(`/properties/${id}/approve`, {});
      setProperties((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ } finally { setActing(null); }
  }

  async function approveEvent(id: string): Promise<void> {
    setActing(id);
    try {
      await apiClient.patch(`/events/${id}/approve`, {});
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch { /* ignore */ } finally { setActing(null); }
  }

  async function rejectEvent(id: string): Promise<void> {
    const reason = prompt("Raison du rejet (obligatoire)");
    if (!reason) return;
    setActing(id);
    try {
      await apiClient.patch(`/events/${id}/reject`, { reason });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch { /* ignore */ } finally { setActing(null); }
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "restaurants", label: "Restaurants", count: restaurants.length },
    { key: "properties",  label: "Hôtels",      count: properties.length },
    { key: "events",      label: "Événements",  count: events.length },
  ];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-3">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Approbations</h1>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "flex-1 py-1.5 rounded-full text-sm font-dm transition-colors",
                tab === t.key ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {loading && [1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
            <div className="h-8 bg-gray-200 rounded-xl" />
          </div>
        ))}

        {/* Restaurants */}
        {tab === "restaurants" && !loading && restaurants.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-jakarta font-bold text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-500 font-dm">{r.restaurant_type} · {r.city.name}</p>
              </div>
              <p className="text-xs text-gray-400 font-dm">{new Date(r.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <p className="text-xs text-gray-600 font-dm">📍 {r.address}</p>
            <p className="text-xs text-gray-600 font-dm">
              👤 {r.owner.first_name} {r.owner.last_name} · {r.owner.phone}
            </p>
            <p className="text-xs text-gray-400 font-dm">{r._count.menu_items} plats dans le menu</p>
            <button
              onClick={() => void approveRestaurant(r.id)}
              disabled={acting === r.id}
              className="w-full bg-green-600 text-white font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
            >
              {acting === r.id ? "…" : "✅ Approuver"}
            </button>
          </div>
        ))}

        {/* Properties */}
        {tab === "properties" && !loading && properties.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-jakarta font-bold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500 font-dm">
                  {p.property_type} · {p.city.name}
                  {p.star_rating ? ` · ${"★".repeat(p.star_rating)}` : ""}
                </p>
              </div>
              <p className="text-xs text-gray-400 font-dm">{new Date(p.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <p className="text-xs text-gray-600 font-dm">📍 {p.address}</p>
            <p className="text-xs text-gray-600 font-dm">
              👤 {p.owner.first_name} {p.owner.last_name} · {p.owner.phone}
            </p>
            <p className="text-xs text-gray-400 font-dm">{p._count.room_types} types de chambre</p>
            <button
              onClick={() => void approveProperty(p.id)}
              disabled={acting === p.id}
              className="w-full bg-green-600 text-white font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
            >
              {acting === p.id ? "…" : "✅ Approuver"}
            </button>
          </div>
        ))}

        {/* Events */}
        {tab === "events" && !loading && events.map((e) => (
          <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-jakarta font-bold text-gray-900 truncate">{e.title}</p>
                <p className="text-xs text-gray-500 font-dm">{e.venue_name} · {e.city.name}</p>
              </div>
              <p className="text-xs text-gray-400 font-dm shrink-0 ml-2">
                {new Date(e.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <p className="text-xs text-gray-600 font-dm">
              📅 {new Date(e.starts_at).toLocaleDateString("fr-BF", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </p>
            <p className="text-xs text-gray-600 font-dm">
              👤 {e.organizer.first_name} {e.organizer.last_name} · {e.organizer.phone}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void rejectEvent(e.id)}
                disabled={acting === e.id}
                className="flex-1 border border-red-200 text-red-600 font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                Rejeter
              </button>
              <button
                onClick={() => void approveEvent(e.id)}
                disabled={acting === e.id}
                className="flex-1 bg-green-600 text-white font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
              >
                {acting === e.id ? "…" : "✅ Approuver"}
              </button>
            </div>
          </div>
        ))}

        {!loading && (
          (tab === "restaurants" && restaurants.length === 0) ||
          (tab === "properties"  && properties.length === 0)  ||
          (tab === "events"      && events.length === 0)
        ) && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-gray-500 font-dm text-sm">Aucune approbation en attente dans cette catégorie.</p>
          </div>
        )}
      </div>
    </div>
  );
}
