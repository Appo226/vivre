"use client";

export const dynamic = "force-dynamic";

/**
 * transport/mes-billets/page.tsx — TI_005 : Mes réservations de bus
 *
 * Affiche l'historique des réservations de transport de l'utilisateur.
 * Filtrables par statut : tous, à venir, terminés, annulés.
 *
 * Protégé : redirige vers /auth/login si non authentifié.
 * L'authentification est vérifiée via le store Zustand (access_token présent).
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

type FilterType = "all" | "upcoming" | "completed" | "cancelled";

interface BookingSummary {
  id: string;
  seat_numbers: string[];
  passenger_count: number;
  passenger_type: string;
  total_amount: number;
  status: string;
  created_at: string;
  trip: {
    id: string;
    departure_datetime: string;
    arrival_datetime: string;
    status: string;
    origin_city: string;
    destination_city: string;
    distance_km: number;
    duration_minutes: number;
    bus_type: string;
    company: { id: string; name: string; logo_url?: string };
  };
}

interface BookingsResponse {
  bookings: BookingSummary[];
  total: number;
  page: number;
  pages: number;
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Confirmé", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Annulé", color: "bg-red-100 text-red-700" },
  completed: { label: "Terminé", color: "bg-gray-100 text-gray-600" },
};

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function MesBilletsPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  /* Rediriger si non authentifié */
  if (!accessToken) {
    router.push("/auth/login?redirect=/transport/mes-billets");
    return <></>;
  }

  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery<BookingsResponse>({
    queryKey: ["my-bookings", filter, page],
    queryFn: () =>
      apiClient.get<BookingsResponse>(
        `/transport/bookings/me?filter=${filter}&page=${page}&limit=10`
      ),
    staleTime: 60 * 1000, /* 1 minute */
  });

  const FILTERS: { value: FilterType; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "upcoming", label: "À venir" },
    { value: "completed", label: "Terminés" },
    { value: "cancelled", label: "Annulés" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-[#1A6B3A] px-4 pt-12 pb-6">
        <h1 className="text-white text-xl font-bold">Mes billets</h1>
        <p className="text-green-200 text-sm mt-1">Historique de vos réservations</p>
      </div>

      {/* Filtres */}
      <div className="px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setPage(1); /* Réinitialiser la page quand on change de filtre */
              }}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter === f.value
                  ? "bg-[#1A6B3A] text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-600 font-semibold text-sm">Erreur de chargement</p>
          </div>
        )}

        {!isLoading && !isError && data?.bookings.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="text-4xl mb-3">🎫</div>
            <p className="font-semibold text-gray-800">Aucune réservation</p>
            <p className="text-sm text-gray-500 mt-1">
              Vos billets de bus apparaîtront ici.
            </p>
            <button
              onClick={() => router.push("/transport")}
              className="mt-4 bg-[#1A6B3A] text-white text-sm font-semibold px-6 py-2 rounded-full"
            >
              Rechercher un voyage
            </button>
          </div>
        )}

        {data?.bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onPress={() => router.push(`/transport/mes-billets/${booking.id}`)}
          />
        ))}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-40"
            >
              Précédent
            </button>
            <span className="text-sm text-gray-500">
              {page} / {data.pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Carte d'une réservation
 * ============================================================ */

function BookingCard({
  booking,
  onPress,
}: {
  booking: BookingSummary;
  onPress: () => void;
}): React.ReactElement {
  const statusInfo = STATUS_LABELS[booking.status] ?? {
    label: booking.status,
    color: "bg-gray-100 text-gray-600",
  };

  const isUpcoming =
    new Date(booking.trip.departure_datetime) > new Date() &&
    booking.status !== "cancelled";

  return (
    <button
      onClick={onPress}
      className="w-full bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-left active:scale-[0.99]"
    >
      {/* Ligne 1 : Trajet + badge statut */}
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-gray-900">
          {booking.trip.origin_city} → {booking.trip.destination_city}
        </p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Ligne 2 : Compagnie + date */}
      <p className="text-sm text-gray-600 mb-1">{booking.trip.company.name}</p>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>{formatDate(booking.trip.departure_datetime)}</span>
        <span>•</span>
        <span>{formatTime(booking.trip.departure_datetime)}</span>
        {isUpcoming && (
          <>
            <span>•</span>
            <span className="text-[#1A6B3A] font-medium">Départ à venir</span>
          </>
        )}
      </div>

      {/* Ligne 3 : Sièges + montant */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          Sièges : <span className="font-medium text-gray-700">{booking.seat_numbers.join(", ")}</span>
        </div>
        <p className="font-bold text-gray-900 text-sm">
          {booking.total_amount.toLocaleString("fr-FR")} FCFA
        </p>
      </div>
    </button>
  );
}
