"use client";

/**
 * /evenements/mes-billets — Liste des billets d'événements
 */

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface EventBookingSummary {
  id: string;
  quantity: number;
  total_amount: number;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  event: {
    id: string;
    title: string;
    starts_at: string;
    venue_name: string;
    cover_url: string | null;
    city: { name: string };
  };
  ticket_type: { name: string };
}

interface BookingsResponse {
  bookings: EventBookingSummary[];
  total: number;
  page: number;
}

type FilterKey = "all" | "upcoming" | "past" | "cancelled";

/* ============================================================
 * CONFIG
 * ============================================================ */

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Tous" },
  { key: "upcoming",  label: "À venir" },
  { key: "past",      label: "Passés" },
  { key: "cancelled", label: "Annulés" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: "En attente",  color: "text-yellow-700 bg-yellow-50" },
  confirmed:  { label: "Confirmé",    color: "text-green-700  bg-green-50"  },
  cancelled:  { label: "Annulé",      color: "text-red-700    bg-red-50"    },
  checked_in: { label: "Scanné ✓",   color: "text-blue-700   bg-blue-50"   },
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function MesBilletsPage(): React.ReactElement {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["event-bookings", filter],
    queryFn: () =>
      apiClient.get<BookingsResponse>(
        `/events/bookings/me?filter=${filter}&limit=20`
      ),
  });

  const bookings = data?.bookings ?? [];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-3">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Mes billets</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-sm font-dm transition-colors",
                filter === f.key
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {isLoading && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse">
                <div className="h-28 bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700 text-sm font-dm">Impossible de charger vos billets.</p>
            <button onClick={() => void refetch()} className="mt-2 text-red-600 text-sm underline font-dm">
              Réessayer
            </button>
          </div>
        )}

        {!isLoading && !isError && bookings.length === 0 && (
          <div className="text-center py-16">
            <span className="text-5xl">🎟️</span>
            <p className="mt-4 text-gray-500 font-dm text-sm">Aucun billet {filter !== "all" ? "dans cette catégorie" : "pour le moment"}.</p>
            <Link
              href="/evenements"
              className="mt-4 inline-block bg-green-700 text-white px-6 py-2.5 rounded-full text-sm font-jakarta font-medium"
            >
              Explorer les événements
            </Link>
          </div>
        )}

        {bookings.map((booking) => (
          <TicketCard key={booking.id} booking={booking} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * TICKET CARD
 * ============================================================ */

function TicketCard({ booking }: { booking: EventBookingSummary }): React.ReactElement {
  const statusConf = STATUS_CONFIG[booking.status] ?? { label: booking.status, color: "text-gray-600 bg-gray-50" };
  const eventDate = new Date(booking.event.starts_at);
  const isUpcoming = eventDate > new Date() && booking.status === "confirmed";

  return (
    <Link href={`/evenements/mes-billets/${booking.id}`} className="block">
      <div className={[
        "bg-white rounded-xl overflow-hidden border transition-all hover:shadow-md active:scale-[0.99]",
        isUpcoming ? "border-pink-200" : "border-gray-100",
      ].join(" ")}>
        {/* Cover image or placeholder */}
        <div className="relative h-24 bg-gradient-to-r from-pink-500 to-purple-600 flex items-end">
          {booking.event.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={booking.event.cover_url}
              alt={booking.event.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="relative px-3 pb-2 flex items-end justify-between w-full">
            <div>
              <p className="text-white font-sora font-bold text-sm leading-tight line-clamp-1">
                {booking.event.title}
              </p>
              <p className="text-white/80 text-xs font-dm">{booking.event.venue_name}</p>
            </div>
            <span className={`text-xs font-dm font-medium px-2 py-0.5 rounded-full ${statusConf.color}`}>
              {statusConf.label}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="px-3 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-dm text-gray-500">
              {eventDate.toLocaleDateString("fr-BF", { weekday: "short", day: "numeric", month: "short" })}
              {" · "}
              {booking.ticket_type.name}
              {booking.quantity > 1 && ` × ${booking.quantity}`}
            </p>
            <p className="text-xs text-gray-400 font-dm">{booking.event.city.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-jakarta font-bold text-gray-900">
              {booking.total_amount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 font-dm">FCFA</p>
          </div>
        </div>

        {isUpcoming && (
          <div className="px-3 py-1.5 bg-pink-50 border-t border-pink-100">
            <p className="text-xs text-pink-700 font-dm font-medium text-center">
              🎉 Événement à venir — Votre billet est prêt
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
