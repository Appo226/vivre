"use client";

/**
 * hebergement/mes-reservations/page.tsx — HE_004 : Mes réservations hôtelières
 *
 * Liste toutes les réservations d'hébergement de l'utilisateur connecté.
 * Filtres par onglets : Toutes / À venir / Passées / Annulées.
 *
 * Chaque carte affiche les infos essentielles : hôtel, dates, montant, statut.
 * Un clic sur une carte ouvre le détail de la réservation (HE_005).
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface BookingSummary {
  id: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_amount: number;
  status: string;
  created_at: string;
  room_type: { name: string; bed_type: string; price_per_night: number };
  property: {
    id: string;
    name: string;
    property_type: string;
    star_rating: number | null;
    address: string;
    phone: string;
    city: { name: string };
  };
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

type FilterKey = "all" | "upcoming" | "past" | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Toutes"  },
  { key: "upcoming",  label: "À venir" },
  { key: "past",      label: "Passées" },
  { key: "cancelled", label: "Annulées" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "En attente",  color: "text-amber-700", bg: "bg-amber-50" },
  confirmed:  { label: "Confirmée",   color: "text-green-700", bg: "bg-green-50" },
  checked_in: { label: "En cours",    color: "text-blue-700",  bg: "bg-blue-50"  },
  completed:  { label: "Terminée",    color: "text-gray-600",  bg: "bg-gray-100" },
  cancelled:  { label: "Annulée",     color: "text-red-600",   bg: "bg-red-50"   },
};

const PROPERTY_TYPE_ICONS: Record<string, string> = {
  hotel: "🏩", auberge: "🏘️", campement: "⛺", private: "🏠", hostel: "🛏️",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function MesReservationsPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  /* Rediriger si non authentifié */
  if (!accessToken) {
    router.push("/auth?redirect=/hebergement/mes-reservations");
    return <></>;
  }

  const [filter, setFilter] = useState<FilterKey>("all");
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    apiClient
      .get<{ bookings: BookingSummary[]; total: number }>(
        `/property-bookings/me?filter=${filter}`
      )
      .then((res) => {
        setBookings(res.bookings);
        setTotal(res.total);
      })
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, [filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-10 pb-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Mes réservations</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? "Chargement..." : `${total} réservation${total > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Onglets de filtre */}
        <div className="flex overflow-x-auto px-4 pb-3 gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                filter === f.key
                  ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des réservations */}
      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          /* Squelettes */
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          ))
        ) : bookings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-5xl mb-4">🛏️</p>
            <p className="font-semibold text-gray-800">Aucune réservation</p>
            <p className="text-sm text-gray-500 mt-1">
              {filter === "all"
                ? "Vous n'avez pas encore réservé d'hébergement."
                : `Aucune réservation dans la catégorie "${FILTERS.find((f) => f.key === filter)?.label}".`}
            </p>
            <button
              onClick={() => router.push("/hebergement")}
              className="mt-5 bg-[#1A6B3A] text-white font-bold px-6 py-3 rounded-xl"
            >
              Trouver un hébergement
            </button>
          </div>
        ) : (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onClick={() => router.push(`/hebergement/mes-reservations/${booking.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * CARTE RÉSERVATION
 * ============================================================ */

function BookingCard({
  booking,
  onClick,
}: {
  booking: BookingSummary;
  onClick: () => void;
}): React.ReactElement {
  const status = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["pending"]!;
  const icon = PROPERTY_TYPE_ICONS[booking.property.property_type] ?? "🏨";

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.99] transition-all"
    >
      {/* En-tête : nom + badge statut */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl">{icon}</span>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{booking.property.name}</p>
            <p className="text-xs text-gray-500">{booking.property.city.name}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${status.bg} ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Chambre */}
      <p className="text-xs text-gray-500 mb-2">{booking.room_type.name}</p>

      {/* Dates */}
      <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between mb-2">
        <div className="text-center">
          <p className="text-xs text-gray-400">Arrivée</p>
          <p className="text-sm font-semibold text-gray-800">{formatDate(booking.check_in_date)}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-1">
            <div className="h-px flex-1 w-8 bg-gray-300" />
            <span className="text-xs text-gray-400 font-medium">
              {booking.nights_count}N
            </span>
            <div className="h-px flex-1 w-8 bg-gray-300" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Départ</p>
          <p className="text-sm font-semibold text-gray-800">{formatDate(booking.check_out_date)}</p>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{booking.guests_count} voyageur{booking.guests_count > 1 ? "s" : ""}</p>
        <p className="font-bold text-[#1A6B3A] text-sm">{formatFCFA(booking.total_amount)}</p>
      </div>
    </button>
  );
}
