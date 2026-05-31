"use client";

/**
 * /mes-reservations — Hub unifié de toutes les réservations VIVRE
 *
 * Agrège transport, hôtels, commandes, billets événements et courses
 * dans une vue chronologique unique avec filtres par type.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

type BookingType = "transport" | "property" | "food" | "event" | "ride";
type FilterType = "all" | BookingType;

interface BookingItem {
  id: string;
  type: BookingType;
  status: string;
  amount: number;
  date: string;
  cancelled_at: string | null;
  title: string;
  subtitle: string;
  service_date: string;
  href: string;
}

interface BookingsResponse {
  transport: BookingItem[];
  properties: BookingItem[];
  orders: BookingItem[];
  events: BookingItem[];
  rides: BookingItem[];
}

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

const TYPE_CONFIG: Record<BookingType, { icon: string; label: string; color: string }> = {
  transport: { icon: "🚌", label: "Transport",   color: "bg-blue-50 text-blue-700 border-blue-200" },
  property:  { icon: "🏨", label: "Hôtel",       color: "bg-purple-50 text-purple-700 border-purple-200" },
  food:      { icon: "🍽️", label: "Commande",    color: "bg-orange-50 text-orange-700 border-orange-200" },
  event:     { icon: "🎟️", label: "Événement",   color: "bg-pink-50 text-pink-700 border-pink-200" },
  ride:      { icon: "🛵", label: "Course",       color: "bg-green-50 text-green-700 border-green-200" },
};

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending_payment: { label: "En attente",   dot: "bg-yellow-400" },
  pending:         { label: "En attente",   dot: "bg-yellow-400" },
  confirmed:       { label: "Confirmé",     dot: "bg-green-500"  },
  completed:       { label: "Terminé",      dot: "bg-gray-400"   },
  cancelled:       { label: "Annulé",       dot: "bg-red-400"    },
  delivered:       { label: "Livré",        dot: "bg-green-500"  },
  preparing:       { label: "En préparation", dot: "bg-blue-400" },
  ready:           { label: "Prêt",         dot: "bg-blue-500"   },
  picked_up:       { label: "En livraison", dot: "bg-indigo-400" },
  in_progress:     { label: "En cours",     dot: "bg-blue-500"   },
  searching:       { label: "Recherche",    dot: "bg-yellow-400" },
  accepted:        { label: "Accepté",      dot: "bg-green-400"  },
  checked_in:      { label: "Scanné",       dot: "bg-green-600"  },
};

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all",       label: "Tout" },
  { key: "transport", label: "Bus" },
  { key: "property",  label: "Hôtels" },
  { key: "food",      label: "Repas" },
  { key: "event",     label: "Billets" },
  { key: "ride",      label: "Courses" },
];

/* ============================================================
 * PAGE
 * ============================================================ */

export default function MesReservationsPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    void loadBookings();
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<BookingsResponse>("/users/me/bookings");
      setData(res);
    } catch {
      setError("Impossible de charger vos réservations.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Merge and sort all bookings chronologically */
  const allItems: BookingItem[] = data
    ? [
        ...data.transport,
        ...data.properties,
        ...data.orders,
        ...data.events,
        ...data.rides,
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  const filtered = filter === "all" ? allItems : allItems.filter((b) => b.type === filter);

  /* Count per type for badges */
  const counts: Record<BookingType, number> = {
    transport: data?.transport.length ?? 0,
    property:  data?.properties.length ?? 0,
    food:      data?.orders.length ?? 0,
    event:     data?.events.length ?? 0,
    ride:      data?.rides.length ?? 0,
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-4">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-800">
            ‹
          </button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Mes réservations</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTER_TABS.map((tab) => {
            const count = tab.key !== "all" ? counts[tab.key as BookingType] : allItems.length;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={[
                  "shrink-0 px-3 py-1.5 rounded-full text-sm font-dm transition-colors",
                  filter === tab.key
                    ? "bg-green-700 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                ].join(" ")}
              >
                {tab.label}
                {count > 0 && (
                  <span className={[
                    "ml-1.5 text-xs font-jakarta",
                    filter === tab.key ? "text-green-200" : "text-gray-400",
                  ].join(" ")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 pt-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="w-16 h-4 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700 text-sm font-dm">{error}</p>
            <button onClick={() => void loadBookings()} className="mt-2 text-red-600 text-sm font-jakarta underline">
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState filter={filter} />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((booking) => (
              <BookingCard key={`${booking.type}-${booking.id}`} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * BOOKING CARD
 * ============================================================ */

function BookingCard({ booking }: { booking: BookingItem }): React.ReactElement {
  const config = TYPE_CONFIG[booking.type];
  const statusConfig = STATUS_CONFIG[booking.status] ?? { label: booking.status, dot: "bg-gray-400" };

  const serviceDate = new Date(booking.service_date);
  const isUpcoming = serviceDate > new Date() && booking.status !== "cancelled" && booking.status !== "completed";

  return (
    <Link href={booking.href} className="block">
      <div className={[
        "bg-white rounded-xl p-4 border transition-all hover:shadow-md active:scale-[0.99]",
        isUpcoming ? "border-green-200 shadow-sm" : "border-gray-100",
      ].join(" ")}>
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className={[
            "w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 border",
            config.color,
          ].join(" ")}>
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-jakarta font-semibold text-gray-900 text-sm truncate">
                  {booking.title}
                </p>
                <p className="text-xs text-gray-500 font-dm truncate">
                  {config.label} · {booking.subtitle}
                </p>
              </div>
              <span className="text-sm font-jakarta font-bold text-gray-900 shrink-0">
                {booking.amount.toLocaleString()} <span className="text-xs font-normal text-gray-500">FCFA</span>
              </span>
            </div>

            <div className="flex items-center justify-between mt-2">
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dot}`} />
                <span className="text-xs font-dm text-gray-600">{statusConfig.label}</span>
              </div>
              {/* Date */}
              <span className="text-xs text-gray-400 font-dm">
                {serviceDate.toLocaleDateString("fr-BF", {
                  day: "numeric", month: "short",
                  ...(serviceDate.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
                })}
              </span>
            </div>
          </div>
        </div>

        {isUpcoming && (
          <div className="mt-2 pt-2 border-t border-green-100 flex items-center gap-1">
            <span className="text-xs text-green-700 font-dm font-medium">À venir</span>
            <span className="text-green-300 text-xs">·</span>
            <span className="text-xs text-green-600 font-dm">Voir les détails →</span>
          </div>
        )}
      </div>
    </Link>
  );
}

/* ============================================================
 * EMPTY STATE
 * ============================================================ */

const EMPTY_MESSAGES: Record<FilterType, { icon: string; text: string; href?: string; cta?: string }> = {
  all:       { icon: "📋", text: "Vous n'avez pas encore de réservations." },
  transport: { icon: "🚌", text: "Aucun billet de bus.", href: "/transport", cta: "Rechercher un voyage" },
  property:  { icon: "🏨", text: "Aucune réservation d'hôtel.", href: "/hebergement", cta: "Explorer les hôtels" },
  food:      { icon: "🍽️", text: "Aucune commande.", href: "/food", cta: "Commander un repas" },
  event:     { icon: "🎟️", text: "Aucun billet d'événement.", href: "/evenements", cta: "Voir les événements" },
  ride:      { icon: "🛵", text: "Aucune course.", href: "/course", cta: "Prendre une course" },
};

function EmptyState({ filter }: { filter: FilterType }): React.ReactElement {
  const config = EMPTY_MESSAGES[filter];
  return (
    <div className="text-center py-16">
      <span className="text-5xl">{config.icon}</span>
      <p className="mt-4 text-gray-500 font-dm text-sm">{config.text}</p>
      {config.href && (
        <Link
          href={config.href}
          className="mt-4 inline-block bg-green-700 text-white px-6 py-2.5 rounded-full text-sm font-jakarta font-medium hover:bg-green-800 transition-colors"
        >
          {config.cta}
        </Link>
      )}
    </div>
  );
}
