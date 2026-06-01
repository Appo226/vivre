"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/[id]/page.tsx — EV_002 : Détail d'un événement + achat de billets
 *
 * Affiche :
 *   - Photo de couverture + galerie
 *   - Titre, catégorie, lieu, date/heure
 *   - Description complète
 *   - Informations de sécurité (transparence)
 *   - Types de billets avec disponibilité
 *   - Bouton d'achat → modal de confirmation
 */

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface TicketType {
  id: string;
  name: string;
  description?: string;
  price_fcfa: number;
  quantity: number;
  available: number;
  max_per_order: number;
  sale_starts_at?: string;
  sale_ends_at?: string;
}

interface EventDetail {
  id: string;
  title: string;
  description: string;
  cover_url?: string;
  gallery_urls: string[];
  venue_name: string;
  venue_address: string;
  latitude?: number;
  longitude?: number;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  status: string;
  is_featured: boolean;
  safety_description?: string;
  city: { name: string };
  category: { name: string; icon?: string; color_hex: string };
  organizer: { id: string; first_name?: string; last_name?: string };
  ticket_types: TicketType[];
  total_bookings: number;
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function EventDetailPage(): React.ReactElement | null {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();

  const [selectedTicketType, setSelectedTicketType] = useState<TicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);

  const { data: event, isLoading, isError } = useQuery<EventDetail>({
    queryKey: ["event", id],
    queryFn: () => apiClient.get<EventDetail>(`/events/${id}`),
    staleTime: 2 * 60 * 1000,
  });

  const bookingMutation = useMutation({
    mutationFn: (data: { event_id: string; ticket_type_id: string; quantity: number }) =>
      apiClient.post<{ booking_id: string }>("/events/bookings", data),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["event", id] });
      void queryClient.invalidateQueries({ queryKey: ["event-bookings"] });
      router.push(`/evenements/mes-billets/${response.booking_id}`);
    },
    onError: (err) => {
      setBookingError(err instanceof ApiError ? err.message : "Erreur lors de la réservation");
    },
  });

  function openBookingModal(tt: TicketType): void {
    if (!accessToken) return;
    setSelectedTicketType(tt);
    setQuantity(1);
    setBookingError("");
    setShowBookingModal(true);
  }

  function handleBook(): void {
    if (!selectedTicketType || !event) return;
    bookingMutation.mutate({
      event_id: event.id,
      ticket_type_id: selectedTicketType.id,
      quantity,
    });
  }

  /* ---- LOADING ---- */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 animate-pulse">
        <div className="h-64 bg-gray-300" />
        <div className="px-4 py-4 space-y-3">
          <div className="h-6 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Événement introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-[#1A6B3A] text-sm">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const isPast = new Date(event.starts_at) < new Date();
  const isSoldOut = event.ticket_types.every((tt) => tt.available === 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Image de couverture */}
      <div className="relative">
        {event.cover_url ? (
          <img
            src={event.cover_url}
            alt={event.title}
            className="w-full h-64 object-cover"
          />
        ) : (
          <div
            className="w-full h-64 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, #1A1A2E, ${event.category.color_hex})` }}
          >
            <span className="text-8xl">{event.category.icon ?? "🎪"}</span>
          </div>
        )}

        {/* Bouton retour */}
        <button
          onClick={() => router.back()}
          className="absolute top-12 left-4 w-10 h-10 bg-black/40 backdrop-blur rounded-full flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Badge catégorie */}
        <div
          className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-white text-xs font-semibold"
          style={{ backgroundColor: event.category.color_hex }}
        >
          {event.category.icon} {event.category.name}
        </div>

        {event.is_featured && (
          <div className="absolute bottom-4 right-4 bg-[#F5A623] px-3 py-1 rounded-full text-white text-xs font-bold">
            ⭐ À la une
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="px-4 py-4 space-y-4">

        {/* Titre + lieu + date */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-['Sora']">{event.title}</h1>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <span>{event.venue_name}, {event.city.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="capitalize">{formatFullDate(event.starts_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatTime(event.starts_at)} → {formatTime(event.ends_at)}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">À propos</h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        </div>

        {/* Informations de sécurité — bouton toggle */}
        {event.safety_description && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSafetyInfo((s) => !s)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-semibold text-gray-800 text-sm">Informations de sécurité</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showSafetyInfo ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSafetyInfo && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <p className="text-sm text-gray-600 leading-relaxed mt-3 whitespace-pre-line">
                  {event.safety_description}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Types de billets */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Billets</h2>
          {isPast ? (
            <div className="bg-gray-100 rounded-2xl p-4 text-center">
              <p className="text-gray-500 font-medium">Cet événement est passé</p>
            </div>
          ) : isSoldOut ? (
            <div className="bg-red-50 rounded-2xl p-4 text-center border border-red-200">
              <p className="text-red-600 font-medium">Complet — plus de billets disponibles</p>
            </div>
          ) : (
            <div className="space-y-3">
              {event.ticket_types.map((tt) => (
                <TicketTypeCard
                  key={tt.id}
                  ticket={tt}
                  onSelect={() => openBookingModal(tt)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal réservation */}
      {showBookingModal && selectedTicketType && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl px-4 py-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Réserver un billet</h2>
            <p className="text-sm text-gray-500 mb-4">{event.title}</p>

            {/* Résumé ticket */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">{selectedTicketType.name}</p>
                  {selectedTicketType.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{selectedTicketType.description}</p>
                  )}
                </div>
                <p className="font-bold text-[#1A6B3A]">
                  {selectedTicketType.price_fcfa === 0
                    ? "Gratuit"
                    : `${selectedTicketType.price_fcfa.toLocaleString("fr-FR")} FCFA`}
                </p>
              </div>
            </div>

            {/* Quantité */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-700">Quantité</p>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-3 text-gray-600 hover:bg-gray-100 font-bold"
                >
                  −
                </button>
                <span className="px-4 font-semibold text-gray-900">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedTicketType.max_per_order, selectedTicketType.available, q + 1))}
                  className="px-4 py-3 text-gray-600 hover:bg-gray-100 font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center py-3 border-t border-gray-100 mb-4">
              <p className="text-gray-600 font-medium">Total</p>
              <p className="text-xl font-bold text-gray-900">
                {(selectedTicketType.price_fcfa * quantity).toLocaleString("fr-FR")} FCFA
              </p>
            </div>

            {bookingError && (
              <p className="text-red-600 text-sm mb-3 text-center">{bookingError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowBookingModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={handleBook}
                disabled={bookingMutation.isPending}
                className="flex-1 py-3 bg-[#1A6B3A] text-white rounded-xl font-semibold disabled:opacity-60"
              >
                {bookingMutation.isPending ? "Réservation..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Carte type de billet
 * ============================================================ */

function TicketTypeCard({
  ticket,
  onSelect,
}: {
  ticket: TicketType;
  onSelect: () => void;
}): React.ReactElement {
  const isAvailable = ticket.available > 0;
  const isAlmostGone = ticket.available > 0 && ticket.available <= 10;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{ticket.name}</p>
          {ticket.description && (
            <p className="text-xs text-gray-500 mt-0.5">{ticket.description}</p>
          )}
        </div>
        <div className="text-right ml-3">
          <p className="font-bold text-[#1A6B3A] text-lg">
            {ticket.price_fcfa === 0
              ? "Gratuit"
              : `${ticket.price_fcfa.toLocaleString("fr-FR")}`}
          </p>
          {ticket.price_fcfa > 0 && (
            <p className="text-xs text-gray-400">FCFA</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className={`text-xs font-medium ${
          !isAvailable
            ? "text-red-500"
            : isAlmostGone
            ? "text-amber-600"
            : "text-gray-500"
        }`}>
          {!isAvailable
            ? "Épuisé"
            : isAlmostGone
            ? `⚠ ${ticket.available} restant${ticket.available > 1 ? "s" : ""}`
            : `${ticket.available} disponible${ticket.available > 1 ? "s" : ""}`}
        </span>

        <button
          disabled={!isAvailable}
          onClick={onSelect}
          className="bg-[#1A6B3A] text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#155830] transition-colors active:scale-95"
        >
          {ticket.price_fcfa === 0 ? "Réserver" : "Acheter"}
        </button>
      </div>
    </div>
  );
}
