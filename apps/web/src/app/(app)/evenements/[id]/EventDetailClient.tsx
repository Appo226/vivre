"use client";

/**
 * evenements/[id]/EventDetailClient.tsx — EV_002 : Détail d'un événement + achat de billets
 *
 * Affiche :
 *   - Photo de couverture + galerie
 *   - Titre, catégorie, lieu, date/heure
 *   - Description complète
 *   - Informations de sécurité (transparence)
 *   - Types de billets avec disponibilité
 *   - Bouton d'achat → modal de confirmation
 *
 * Composant client — la génération des balises Open Graph (partage WhatsApp/Instagram)
 * se fait côté serveur dans page.tsx, qui rend ce composant pour toute la partie interactive.
 */

import React, { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import { FavoriteHeart } from "@/components/FavoriteHeart";

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
  is_seated: boolean;
  included_items: string[];
  variant_options: string[];
  sale_starts_at?: string;
  sale_ends_at?: string;
}

interface MerchItem {
  id: string;
  name: string;
  description?: string;
  price_fcfa: number;
  quantity: number;
  available: number;
  variant_options: string[];
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
  merch_items: MerchItem[];
  total_bookings: number;
  rating_avg: number;
  review_count: number;
  can_review: boolean;
  my_review: { id: string; rating: number; comment: string | null } | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  is_verified: boolean;
  created_at: string;
  user: { first_name?: string; last_name?: string; avatar_url?: string };
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

export default function EventDetailClient(): React.ReactElement | null {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const t = useT();

  const [selectedTicketType, setSelectedTicketType] = useState<TicketType | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [selectedMerch, setSelectedMerch] = useState<Record<string, { quantity: number; variant: string }>>({});
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingError, setBookingError] = useState("");
  // Régénérée à chaque ouverture du panneau de réservation — un double-clic/retry réseau sur
  // "Confirmer" pendant que le panneau reste ouvert réutilise la même clé, donc le serveur
  // dédoublonne au lieu de créer deux commandes distinctes pour le même choix.
  const bookingIdempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);

  const { data: event, isLoading, isError } = useQuery<EventDetail>({
    queryKey: ["event", id],
    queryFn: () => apiClient.get<EventDetail>(`/events/${id}`),
    staleTime: 2 * 60 * 1000,
  });

  const bookingMutation = useMutation({
    mutationFn: (data: {
      event_id: string;
      ticket_type_id: string;
      quantity: number;
      selected_variant?: string;
      merch_items?: { merch_item_id: string; quantity: number; variant?: string }[];
    }) =>
      apiClient.post<{ booking_id: string }>("/events/bookings", data, {
        headers: { "Idempotency-Key": bookingIdempotencyKeyRef.current },
      }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["event", id] });
      void queryClient.invalidateQueries({ queryKey: ["event-bookings"] });
      router.push(`/evenements/mes-billets/${response.booking_id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "PHONE_NOT_VERIFIED") {
        router.push(`/auth/verify?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (err instanceof ApiError && err.code === "REQUEST_IN_PROGRESS") {
        setBookingError("Déjà en cours de traitement — patientez quelques secondes.");
        return;
      }
      setBookingError(err instanceof ApiError ? err.message : "Erreur lors de la réservation");
    },
  });

  /* Un seul type de billet par commande — contrainte réelle du backend (EventBooking a un
     ticket_type_id unique, pas une liste de lignes), pas juste un choix d'UI. Incrémenter le
     stepper d'un type différent de celui déjà actif bascule donc dessus au lieu d'empiler
     plusieurs types dans une même commande. */
  function incrementType(tt: TicketType): void {
    if (selectedTicketType?.id === tt.id) {
      setQuantity((q) => Math.min(tt.max_per_order, tt.available, q + 1));
    } else {
      setSelectedTicketType(tt);
      setQuantity(1);
      setSelectedVariant("");
      setSelectedMerch({});
    }
  }

  function decrementType(tt: TicketType): void {
    if (selectedTicketType?.id !== tt.id) return;
    setQuantity((q) => {
      const next = q - 1;
      if (next <= 0) {
        setSelectedTicketType(null);
        return 0;
      }
      return next;
    });
  }

  function openBookingModal(): void {
    if (!accessToken || !selectedTicketType) return;
    setSelectedVariant("");
    setSelectedMerch({});
    setBookingError("");
    bookingIdempotencyKeyRef.current = crypto.randomUUID();
    setShowBookingModal(true);
  }

  function toggleMerch(itemId: string): void {
    setSelectedMerch((prev) => {
      if (prev[itemId]) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { quantity: 1, variant: "" } };
    });
  }

  function setMerchQuantity(itemId: string, qty: number): void {
    setSelectedMerch((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId]!, quantity: qty } } : prev));
  }

  function setMerchVariant(itemId: string, variant: string): void {
    setSelectedMerch((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId]!, variant } } : prev));
  }

  function handleBook(): void {
    if (!selectedTicketType || !event) return;
    if (selectedTicketType.variant_options.length > 0 && !selectedVariant) {
      setBookingError("Choisissez une option avant de continuer.");
      return;
    }
    for (const [itemId, sel] of Object.entries(selectedMerch)) {
      const item = event.merch_items.find((m) => m.id === itemId);
      if (item && item.variant_options.length > 0 && !sel.variant) {
        setBookingError(`Choisissez une option pour "${item.name}".`);
        return;
      }
    }
    const merchItemsPayload = Object.entries(selectedMerch).map(([merch_item_id, sel]) => ({
      merch_item_id,
      quantity: sel.quantity,
      ...(sel.variant && { variant: sel.variant }),
    }));
    bookingMutation.mutate({
      event_id: event.id,
      ticket_type_id: selectedTicketType.id,
      quantity,
      ...(selectedVariant && { selected_variant: selectedVariant }),
      ...(merchItemsPayload.length > 0 && { merch_items: merchItemsPayload }),
    });
  }

  /* ---- LOADING ---- */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-page animate-pulse">
        <div className="h-64 bg-surface-elevated" />
        <div className="px-4 py-4 space-y-3">
          <div className="h-6 bg-surface-elevated rounded w-3/4" />
          <div className="h-4 bg-surface-elevated rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Événement introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-[#1A6B3A] dark:text-green-300 text-sm">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const isPast = new Date(event.starts_at) < new Date();
  const isSoldOut = event.ticket_types.every((tt) => tt.available === 0);

  return (
    <div className="min-h-screen bg-page pb-8">
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

        <FavoriteHeart
          eventId={event.id}
          size={20}
          className="absolute top-12 right-4 w-10 h-10 bg-black/40 backdrop-blur text-white"
        />

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
          <h1 className="text-xl font-bold text-ink font-['Sora']">{event.title}</h1>
          {event.review_count > 0 && (
            <div className="mt-1 flex items-center gap-1 text-sm">
              <span className="text-amber-500">★</span>
              <span className="font-semibold text-ink">{event.rating_avg.toFixed(1)}</span>
              <span className="text-ink-soft">
                ({event.review_count} {t.reviews_count_suffix})
              </span>
            </div>
          )}
          <div className="mt-2 space-y-1.5">
            <div className="flex items-start gap-2 text-sm text-ink-soft">
              <svg className="w-4 h-4 text-ink-soft flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <div>
                <p>{event.venue_name}, {event.city.name}</p>
                <p className="text-xs text-ink-soft">{event.venue_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <svg className="w-4 h-4 text-ink-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="capitalize">{formatFullDate(event.starts_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <svg className="w-4 h-4 text-ink-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatTime(event.starts_at)} → {formatTime(event.ends_at)}</span>
            </div>
          </div>

          {event.latitude != null && event.longitude != null ? (
            <a
              href={`https://maps.google.com/maps?daddr=${event.latitude},${event.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A6B3A] dark:text-green-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
              Itinéraire
            </a>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">
              Itinéraire non disponible : l&apos;organisateur n&apos;a pas positionné le lieu sur la carte.
            </p>
          )}
        </div>

        {/* Description */}
        <div className="bg-surface-card rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-ink mb-2">À propos</h2>
          <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        </div>

        {/* Informations de sécurité — bouton toggle */}
        {event.safety_description && (
          <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSafetyInfo((s) => !s)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-semibold text-ink text-sm">Informations de sécurité</span>
              </div>
              <svg
                className={`w-4 h-4 text-ink-soft transition-transform ${showSafetyInfo ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSafetyInfo && (
              <div className="px-4 pb-4 border-t border-border-subtle">
                <p className="text-sm text-ink-soft leading-relaxed mt-3 whitespace-pre-line">
                  {event.safety_description}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Types de billets */}
        <div>
          <h2 className="font-semibold text-ink mb-3">{t.tickets_header}</h2>
          {isPast ? (
            <div className="bg-surface-elevated rounded-2xl p-4 text-center">
              <p className="text-ink-soft font-medium">{t.tickets_past_event}</p>
            </div>
          ) : isSoldOut ? (
            <div className="bg-red-50 rounded-2xl p-4 text-center border border-red-200">
              <p className="text-red-600 font-medium">{t.tickets_sold_out}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {event.ticket_types.map((tt) => (
                <TicketTypeCard
                  key={tt.id}
                  ticket={tt}
                  quantity={selectedTicketType?.id === tt.id ? quantity : 0}
                  onIncrement={() => incrementType(tt)}
                  onDecrement={() => decrementType(tt)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Avis */}
        <ReviewsSection
          eventId={event.id}
          ratingAvg={event.rating_avg}
          reviewCount={event.review_count}
          canReview={event.can_review}
          myReview={event.my_review}
        />
      </div>

      {/* Barre flottante — apparaît dès qu'un type de billet a une quantité choisie dans la
          liste ci-dessus, remplace l'ancien flux "taper Acheter → modal vide à remplir" par
          "ajuster la quantité en place → Continuer pour finaliser". Cachée pendant que la
          modale de confirmation est ouverte pour ne pas empiler deux barres d'action. */}
      {selectedTicketType && quantity > 0 && !showBookingModal && (
        <div className="fixed bottom-[var(--bottom-nav-height)] left-0 right-0 z-50 bg-surface-card border-t border-border-subtle px-4 py-3 shadow-modal">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-soft">
                {quantity} × {selectedTicketType.name}
              </p>
              <p className="font-bold text-ink">
                {(selectedTicketType.price_fcfa * quantity).toLocaleString("fr-FR")} FCFA
              </p>
            </div>
            <button
              onClick={openBookingModal}
              className="bg-[#1A6B3A] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#155830] transition-colors active:scale-95"
            >
              {t.tickets_continue} →
            </button>
          </div>
        </div>
      )}
      {selectedTicketType && quantity > 0 && !showBookingModal && (
        <div className="h-24" aria-hidden="true" />
      )}

      {/* Modal réservation */}
      {showBookingModal && selectedTicketType && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[60]">
          <div className="w-full bg-surface-card rounded-t-3xl px-4 py-6 max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <h2 className="text-lg font-bold text-ink mb-1">{t.tickets_book_ticket}</h2>
            <p className="text-sm text-ink-soft mb-4">{event.title}</p>

            {/* Résumé ticket */}
            <div className="bg-surface-elevated rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-ink">{selectedTicketType.name}</p>
                  {selectedTicketType.description && (
                    <p className="text-xs text-ink-soft mt-0.5">{selectedTicketType.description}</p>
                  )}
                </div>
                <p className="font-bold text-[#1A6B3A] dark:text-green-300">
                  {selectedTicketType.price_fcfa === 0
                    ? "Gratuit"
                    : `${selectedTicketType.price_fcfa.toLocaleString("fr-FR")} FCFA`}
                </p>
              </div>
              {selectedTicketType.included_items.length > 0 && (
                <ul className="mt-3 pt-3 border-t border-border-subtle space-y-1">
                  {selectedTicketType.included_items.map((item, i) => (
                    <li key={i} className="text-xs text-ink-soft flex items-center gap-1.5">
                      <span className="text-[#1A6B3A] dark:text-green-300">✓</span> {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedTicketType.variant_options.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-ink mb-2">{t.tickets_choose_option}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTicketType.variant_options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedVariant(opt)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        selectedVariant === opt
                          ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                          : "bg-surface-card text-ink border-border-subtle"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantité */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-ink">{t.tickets_quantity}</p>
              <div className="flex items-center border border-border-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-3 text-ink-soft hover:bg-surface-elevated font-bold"
                >
                  −
                </button>
                <span className="px-4 font-semibold text-ink">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedTicketType.max_per_order, selectedTicketType.available, q + 1))}
                  className="px-4 py-3 text-ink-soft hover:bg-surface-elevated font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Produits en option */}
            {event.merch_items.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-ink mb-2">{t.tickets_add_products}</p>
                <div className="space-y-2">
                  {event.merch_items.map((item) => {
                    const sel = selectedMerch[item.id];
                    const soldOut = item.available === 0;
                    return (
                      <div key={item.id} className="border border-border-subtle rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            disabled={soldOut}
                            onClick={() => toggleMerch(item.id)}
                            className="flex items-start gap-2 flex-1 text-left disabled:opacity-40"
                          >
                            <span className={`w-4 h-4 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center ${sel ? "bg-[#1A6B3A] border-[#1A6B3A]" : "border-border-subtle"}`}>
                              {sel && <span className="text-white text-[10px]">✓</span>}
                            </span>
                            <span>
                              <span className="text-sm font-medium text-ink block">{item.name}</span>
                              {item.description && <span className="text-xs text-ink-soft block">{item.description}</span>}
                              <span className="text-xs text-ink-soft block">{soldOut ? t.tickets_item_sold_out : `${item.available} ${t.tickets_available_suffix}`}</span>
                            </span>
                          </button>
                          <span className="text-sm font-semibold text-[#1A6B3A] dark:text-green-300 flex-shrink-0">
                            {item.price_fcfa.toLocaleString("fr-FR")} F
                          </span>
                        </div>

                        {sel && (
                          <div className="mt-3 pl-6 space-y-2">
                            {item.variant_options.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {item.variant_options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setMerchVariant(item.id, opt)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                                      sel.variant === opt
                                        ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                                        : "bg-surface-card text-ink-soft border-border-subtle"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setMerchQuantity(item.id, Math.max(1, sel.quantity - 1))}
                                className="w-7 h-7 border border-border-subtle rounded-lg text-ink-soft font-bold"
                              >
                                −
                              </button>
                              <span className="text-sm font-medium text-ink w-4 text-center">{sel.quantity}</span>
                              <button
                                type="button"
                                onClick={() => setMerchQuantity(item.id, Math.min(item.available, sel.quantity + 1))}
                                className="w-7 h-7 border border-border-subtle rounded-lg text-ink-soft font-bold"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center py-3 border-t border-border-subtle mb-4">
              <p className="text-ink-soft font-medium">{t.tickets_total}</p>
              <p className="text-xl font-bold text-ink">
                {(
                  selectedTicketType.price_fcfa * quantity +
                  Object.entries(selectedMerch).reduce((sum, [itemId, sel]) => {
                    const item = event.merch_items.find((m) => m.id === itemId);
                    return sum + (item ? item.price_fcfa * sel.quantity : 0);
                  }, 0)
                ).toLocaleString("fr-FR")} FCFA
              </p>
            </div>

            {bookingError && (
              <p className="text-red-600 text-sm mb-3 text-center">{bookingError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowBookingModal(false)}
                className="flex-1 py-3 border border-border-subtle rounded-xl text-ink font-semibold"
              >
                {t.tickets_cancel}
              </button>
              <button
                onClick={handleBook}
                disabled={bookingMutation.isPending}
                className="flex-1 py-3 bg-[#1A6B3A] text-white rounded-xl font-semibold disabled:opacity-60"
              >
                {bookingMutation.isPending ? t.tickets_booking_in_progress : t.tickets_confirm}
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
  quantity,
  onIncrement,
  onDecrement,
}: {
  ticket: TicketType;
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}): React.ReactElement {
  const t = useT();
  const isAvailable = ticket.available > 0;
  const isAlmostGone = ticket.available > 0 && ticket.available <= 10;
  const atMax = quantity >= Math.min(ticket.max_per_order, ticket.available);

  return (
    <div className="bg-surface-card rounded-2xl p-4 shadow-sm border border-border-subtle">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink">{ticket.name}</p>
            {ticket.is_seated && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1A6B3A] dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-full px-1.5 py-0.5">
                {t.tickets_seated}
              </span>
            )}
          </div>
          {ticket.description && (
            <p className="text-xs text-ink-soft mt-0.5">{ticket.description}</p>
          )}
        </div>
        <div className="text-right ml-3">
          <p className="font-bold text-[#1A6B3A] dark:text-green-300 text-lg">
            {ticket.price_fcfa === 0
              ? t.tickets_free
              : `${ticket.price_fcfa.toLocaleString("fr-FR")}`}
          </p>
          {ticket.price_fcfa > 0 && (
            <p className="text-xs text-ink-soft">FCFA</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className={`text-xs font-medium ${
          !isAvailable
            ? "text-red-500"
            : isAlmostGone
            ? "text-amber-600"
            : "text-ink-soft"
        }`}>
          {!isAvailable
            ? t.tickets_item_sold_out
            : isAlmostGone
            ? `⚠ ${ticket.available} ${t.tickets_remaining_suffix}`
            : `${ticket.available} ${t.tickets_available_suffix}`}
        </span>

        {isAvailable && (
          <div className="flex items-center border border-border-subtle rounded-xl overflow-hidden">
            <button
              type="button"
              disabled={quantity === 0}
              onClick={onDecrement}
              className="w-9 h-9 flex items-center justify-center text-ink-soft font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-elevated"
              aria-label={`Retirer un billet ${ticket.name}`}
            >
              −
            </button>
            <span className="w-7 text-center font-semibold text-ink text-sm tabular-nums">{quantity}</span>
            <button
              type="button"
              disabled={atMax}
              onClick={onIncrement}
              className="w-9 h-9 flex items-center justify-center text-ink-soft font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-elevated"
              aria-label={`Ajouter un billet ${ticket.name}`}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT : Avis
 * ============================================================ */

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-2xl leading-none"
          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
        >
          <span className={n <= value ? "text-amber-500" : "text-border-subtle"}>★</span>
        </button>
      ))}
    </div>
  );
}

function ReviewsSection({
  eventId,
  ratingAvg,
  reviewCount,
  canReview,
  myReview,
}: {
  eventId: string;
  ratingAvg: number;
  reviewCount: number;
  canReview: boolean;
  myReview: { id: string; rating: number; comment: string | null } | null;
}): React.ReactElement {
  const t = useT();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(myReview?.rating ?? 5);
  const [comment, setComment] = useState(myReview?.comment ?? "");

  const { data } = useQuery<{ reviews: Review[]; total: number }>({
    queryKey: ["event-reviews", eventId],
    queryFn: () => apiClient.get<{ reviews: Review[]; total: number }>(`/events/${eventId}/reviews`),
    staleTime: 60 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/events/${eventId}/reviews`, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-reviews", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      setShowForm(false);
    },
  });

  const reviews = data?.reviews ?? [];
  if (!canReview && !myReview && reviews.length === 0) return <></>;

  return (
    <div className="bg-surface-card rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-ink">{t.reviews_title}</h2>
        {reviewCount > 0 && (
          <span className="text-sm text-ink-soft flex items-center gap-1">
            <span className="text-amber-500">★</span> {ratingAvg.toFixed(1)} ({reviewCount})
          </span>
        )}
      </div>

      {(canReview || myReview) && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-4 text-sm font-semibold text-[#1A6B3A] dark:text-green-300"
        >
          {myReview ? t.reviews_edit : t.reviews_write}
        </button>
      )}

      {showForm && (
        <div className="mb-4 p-3 bg-surface-elevated rounded-xl space-y-3">
          <div>
            <p className="text-xs font-medium text-ink-soft mb-1.5">{t.reviews_your_rating}</p>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t.reviews_comment_placeholder}
            rows={3}
            className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-ink resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 border border-border-subtle rounded-xl text-ink text-sm font-semibold"
            >
              {t.tickets_cancel}
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 py-2 bg-[#1A6B3A] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {submitMutation.isPending ? t.reviews_submitting : t.reviews_submit}
            </button>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-ink-soft">{t.reviews_empty}</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  {r.user.first_name ?? "—"} {r.user.last_name?.[0] ? `${r.user.last_name[0]}.` : ""}
                </p>
                <span className="text-amber-500 text-sm">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
              </div>
              {r.is_verified && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1A6B3A] dark:text-green-300">
                  {t.reviews_verified}
                </span>
              )}
              {r.comment && <p className="text-sm text-ink-soft mt-1">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
