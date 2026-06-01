"use client";

export const dynamic = "force-dynamic";

/**
 * transport/voyages/[id]/page.tsx — TI_003 : Détail d'un voyage + sélection sièges
 *
 * Affiche :
 *   1. Résumé du voyage (compagnie, horaires, trajet, prix par type de passager)
 *   2. Plan de sièges interactif (grille visuelle bus)
 *   3. Bouton de réservation (déclenche POST /transport/bookings)
 *
 * Plan de sièges :
 *   Vert = disponible  |  Gris = occupé  |  Vert foncé = sélectionné
 *   Clic sur un siège disponible = sélection/désélection
 *   Maximum = 10 sièges sélectionnés en même temps
 *
 * Réservation :
 *   POST /transport/bookings → redirige vers /transport/mes-billets/:bookingId
 *   En MVP, status "pending" (paiement via Étape 13).
 */

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface SeatInfo {
  number: string;
  status: "available" | "occupied";
  row: number;
  col: number;
}

interface TripDetail {
  id: string;
  status: string;
  departure_datetime: string;
  arrival_datetime: string;
  available_seats: number;
  prices: {
    adult: number;
    child: number;
    student: number;
  };
  company: {
    id: string;
    name: string;
    logo_url?: string;
    phone: string;
    address: string;
    rating_avg: number;
  };
  route: {
    origin_city: string;
    destination_city: string;
    distance_km: number;
    duration_minutes: number;
    bus_type: string;
  };
  seat_map: {
    seats: SeatInfo[];
    layout: {
      rows: number;
      cols: number;
      aisle_after_col: number;
    };
  };
}

interface BookingResponse {
  booking_id: string;
  status: string;
  total_amount: number;
  message: string;
}

type PassengerType = "adult" | "child" | "student";

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function TripDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  /* Sièges sélectionnés par l'utilisateur */
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  /* Type de passager — détermine le tarif */
  const [passengerType, setPassengerType] = useState<PassengerType>("adult");
  /* Message d'erreur affiché sous le bouton */
  const [bookingError, setBookingError] = useState<string>("");

  /* Charger les détails du trip */
  const { data: trip, isLoading, isError } = useQuery<TripDetail>({
    queryKey: ["trip", id],
    queryFn: () => apiClient.get<TripDetail>(`/transport/trips/${id}`),
    staleTime: 60 * 1000, /* 1 minute — les sièges se libèrent/réservent fréquemment */
  });

  /* Mutation pour créer la réservation */
  const bookingMutation = useMutation({
    mutationFn: (data: { seat_numbers: string[]; passenger_type: string }) =>
      apiClient.post<BookingResponse>("/transport/bookings", {
        trip_id: id,
        ...data,
      }),
    onSuccess: (response) => {
      /* Invalider le cache du trip (les sièges ont changé) */
      void queryClient.invalidateQueries({ queryKey: ["trip", id] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      /* Naviguer vers le billet */
      router.push(`/transport/mes-billets/${response.booking_id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setBookingError(err.message);
      } else {
        setBookingError("Erreur lors de la réservation, veuillez réessayer");
      }
    },
  });

  /**
   * Sélectionner ou désélectionner un siège.
   * Max 10 sièges par réservation.
   */
  function toggleSeat(seatNumber: string): void {
    setBookingError("");
    setSelectedSeats((prev) => {
      if (prev.includes(seatNumber)) {
        return prev.filter((s) => s !== seatNumber);
      }
      if (prev.length >= 10) {
        setBookingError("Maximum 10 sièges par réservation");
        return prev;
      }
      return [...prev, seatNumber];
    });
  }

  function handleBook(): void {
    if (selectedSeats.length === 0) {
      setBookingError("Veuillez sélectionner au moins un siège");
      return;
    }
    setBookingError("");
    bookingMutation.mutate({ seat_numbers: selectedSeats, passenger_type: passengerType });
  }

  /* ---- LOADING ---- */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement du voyage...</p>
        </div>
      </div>
    );
  }

  /* ---- ERREUR ---- */
  if (isError || !trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Voyage introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-[#1A6B3A] text-sm font-medium">
            Retour
          </button>
        </div>
      </div>
    );
  }

  /* Prix selon le type de passager sélectionné */
  const unitPrice =
    passengerType === "child"
      ? trip.prices.child
      : passengerType === "student"
      ? trip.prices.student
      : trip.prices.adult;

  const totalPrice = unitPrice * Math.max(1, selectedSeats.length);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* En-tête */}
      <div className="bg-[#1A6B3A] px-4 pt-12 pb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-green-200 text-sm mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h1 className="text-white text-xl font-bold">
          {trip.route.origin_city} → {trip.route.destination_city}
        </h1>
        <p className="text-green-200 text-sm mt-0.5">
          {trip.company.name} • {formatDate(trip.departure_datetime)}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Résumé du voyage */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            {/* Horaires */}
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">
                  {formatTime(trip.departure_datetime)}
                </p>
                <p className="text-xs text-gray-500">{trip.route.origin_city}</p>
              </div>
              <div className="flex flex-col items-center px-3">
                <p className="text-xs text-gray-400">
                  {formatDuration(trip.route.duration_minutes)}
                </p>
                <div className="w-12 h-px bg-gray-300 my-1" />
                <p className="text-xs text-gray-400">{trip.route.distance_km} km</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">
                  {formatTime(trip.arrival_datetime)}
                </p>
                <p className="text-xs text-gray-500">{trip.route.destination_city}</p>
              </div>
            </div>
            {/* Places disponibles */}
            <div className="text-right">
              <p className={`font-semibold text-sm ${trip.available_seats <= 5 ? "text-red-600" : "text-gray-700"}`}>
                {trip.available_seats} places
              </p>
              <p className="text-xs text-gray-400">disponibles</p>
            </div>
          </div>

          {/* Compagnie */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Opérateur</p>
              <p className="font-semibold text-gray-800 text-sm">{trip.company.name}</p>
            </div>
            {trip.company.rating_avg > 0 && (
              <span className="text-amber-600 font-semibold text-sm">
                ★ {trip.company.rating_avg.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Sélecteur type de passager */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">Type de passager</p>
          <div className="grid grid-cols-3 gap-2">
            {(["adult", "child", "student"] as PassengerType[]).map((type) => {
              const labels: Record<PassengerType, string> = {
                adult: "Adulte",
                child: "Enfant",
                student: "Étudiant",
              };
              const prices: Record<PassengerType, number> = {
                adult: trip.prices.adult,
                child: trip.prices.child,
                student: trip.prices.student,
              };
              return (
                <button
                  key={type}
                  onClick={() => setPassengerType(type)}
                  className={`rounded-xl p-3 text-center border-2 transition-all ${
                    passengerType === type
                      ? "border-[#1A6B3A] bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <p className={`text-sm font-semibold ${passengerType === type ? "text-[#1A6B3A]" : "text-gray-700"}`}>
                    {labels[type]}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {prices[type].toLocaleString("fr-FR")} F
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * Enfant &lt; 12 ans, étudiant sur présentation de carte
          </p>
        </div>

        {/* Plan de sièges */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">Choisir vos sièges</p>
            <p className="text-xs text-gray-500">
              {selectedSeats.length} sélectionné{selectedSeats.length > 1 ? "s" : ""}
            </p>
          </div>

          {/* Légende */}
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              <span className="text-xs text-gray-500">Disponible</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#1A6B3A]" />
              <span className="text-xs text-gray-500">Sélectionné</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-gray-200" />
              <span className="text-xs text-gray-500">Occupé</span>
            </div>
          </div>

          {/* Avant du bus */}
          <div className="bg-gray-100 rounded-t-xl py-2 text-center text-xs text-gray-500 font-medium mb-2">
            🚌 Avant du bus
          </div>

          {/* Grille de sièges */}
          <SeatGrid
            seats={trip.seat_map.seats}
            layout={trip.seat_map.layout}
            selectedSeats={selectedSeats}
            onToggle={toggleSeat}
          />
        </div>

        {/* Sièges sélectionnés */}
        {selectedSeats.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">Sièges sélectionnés</p>
            <div className="flex flex-wrap gap-2">
              {selectedSeats.map((seat) => (
                <span
                  key={seat}
                  className="bg-[#1A6B3A] text-white text-xs font-bold px-3 py-1 rounded-full"
                >
                  {seat}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barre de réservation fixe en bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 safe-area-inset-bottom">
        {bookingError && (
          <p className="text-red-600 text-xs mb-2 text-center">{bookingError}</p>
        )}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-gray-900">
              {totalPrice.toLocaleString("fr-FR")} <span className="text-sm font-normal text-gray-500">FCFA</span>
            </p>
          </div>
          {selectedSeats.length > 0 && (
            <p className="text-xs text-gray-400">
              {selectedSeats.length} × {unitPrice.toLocaleString("fr-FR")} F
            </p>
          )}
        </div>
        <button
          onClick={handleBook}
          disabled={selectedSeats.length === 0 || bookingMutation.isPending}
          className="w-full bg-[#1A6B3A] text-white font-semibold py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#155830] active:scale-95 transition-all"
        >
          {bookingMutation.isPending
            ? "Réservation en cours..."
            : selectedSeats.length === 0
            ? "Sélectionnez vos sièges"
            : `Réserver ${selectedSeats.length} siège${selectedSeats.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Grille de sièges
 * ============================================================ */

function SeatGrid({
  seats,
  layout,
  selectedSeats,
  onToggle,
}: {
  seats: SeatInfo[];
  layout: { rows: number; cols: number; aisle_after_col: number };
  selectedSeats: string[];
  onToggle: (seat: string) => void;
}): React.ReactElement {
  /*
   * Organiser les sièges par rangée pour le rendu.
   * On groupe par row puis on insère un espace d'allée après aisle_after_col.
   */
  const rows: SeatInfo[][] = [];
  for (let r = 1; r <= layout.rows; r++) {
    rows.push(seats.filter((s) => s.row === r).sort((a, b) => a.col - b.col));
  }

  return (
    <div className="overflow-x-auto">
      <div className="space-y-1.5 min-w-fit mx-auto">
        {rows.map((rowSeats, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-1">
            {/* Numéro de rangée */}
            <span className="w-5 text-xs text-gray-400 text-right flex-shrink-0">
              {rowIdx + 1}
            </span>
            {rowSeats.map((seat, colIdx) => {
              const isSelected = selectedSeats.includes(seat.number);
              const isOccupied = seat.status === "occupied";

              return (
                <React.Fragment key={seat.number}>
                  {/* Espace d'allée après la colonne définie */}
                  {colIdx === layout.aisle_after_col && (
                    <div className="w-4 flex-shrink-0" aria-hidden="true" />
                  )}
                  <button
                    disabled={isOccupied}
                    onClick={() => !isOccupied && onToggle(seat.number)}
                    className={`
                      w-9 h-9 rounded-lg text-xs font-bold flex-shrink-0 transition-all
                      ${isOccupied
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : isSelected
                        ? "bg-[#1A6B3A] text-white shadow-md scale-105"
                        : "bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 active:scale-95"
                      }
                    `}
                    title={`Siège ${seat.number}${isOccupied ? " (occupé)" : ""}`}
                  >
                    {seat.number}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
