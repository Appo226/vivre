"use client";

export const dynamic = "force-dynamic";

/**
 * hebergement/[id]/page.tsx — HE_003 : Détail d'un hébergement
 *
 * Affiche toutes les informations d'un hébergement + ses types de chambres.
 * Si checkin/checkout sont passés en query string (venant des résultats de recherche),
 * on affiche la disponibilité en temps réel pour chaque chambre.
 *
 * L'utilisateur peut sélectionner une chambre et lancer la réservation.
 * La réservation appelle POST /property-bookings et redirige vers mes-reservations.
 */

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface RoomType {
  id: string;
  name: string;
  description: string | null;
  max_occupancy: number;
  bed_type: string;
  price_per_night: number;
  quantity: number;
  amenities: string[];
  /* Présent si dates fournies */
  available?: number;
  total_for_stay?: number;
}

interface Property {
  id: string;
  name: string;
  property_type: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string | null;
  star_rating: number | null;
  rating_avg: number | null;
  amenities: string[];
  check_in_time: string;
  check_out_time: string;
  cancellation_policy: string | null;
  city: { id: string; name: string };
  room_types: RoomType[];
  nights?: number;
  search_params?: { checkin: string; checkout: string; guests: number };
}

interface Review {
  id:          string;
  rating:      number;
  title:       string | null;
  comment:     string | null;
  is_verified: boolean;
  author:      string;
  created_at:  string;
}

interface Eligibility {
  can_review:       boolean;
  already_reviewed: boolean;
  booking_ref_id?:  string;
}

const BED_TYPES: Record<string, string> = {
  single: "Lit simple", double: "Lit double", twin: "Lits jumeaux", king: "Lit king",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel", auberge: "Auberge", campement: "Campement", private: "Location privée", hostel: "Hostel",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * CONTENU (séparé pour Suspense à cause de useSearchParams)
 * ============================================================ */

function PropertyDetailContent({ id }: { id: string }): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();

  /* Paramètres de recherche transmis depuis la page résultats */
  const checkin  = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const guests   = parseInt(searchParams.get("guests") ?? "1", 10);

  /* État principal */
  const [property, setProperty]         = useState<Property | null>(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [isBooking, setIsBooking]       = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [specialRequests, setSpecialRequests]   = useState("");

  /* --- Avis --- */
  const [reviews, setReviews]           = useState<Review[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [eligibility, setEligibility]   = useState<Eligibility | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const loadReviews = useCallback(() => {
    apiClient
      .get<{ reviews: Review[]; total: number }>(
        `/reviews?entity_type=property&entity_id=${id}`
      )
      .then((res) => { setReviews(res.reviews); setReviewsTotal(res.total); })
      .catch(() => { /* ignore */ });
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (guests > 1) params.set("guests", String(guests));

    const qs = params.toString();
    apiClient
      .get<Property>(`/properties/${id}${qs ? `?${qs}` : ""}`)
      .then((res) => setProperty(res))
      .catch(() => setProperty(null))
      .finally(() => setIsLoading(false));

    loadReviews();
  }, [id, checkin, checkout, guests, loadReviews]);

  /* Éligibilité à noter */
  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get<Eligibility>(`/reviews/eligibility?entity_type=property&entity_id=${id}`)
      .then((res) => setEligibility(res))
      .catch(() => { /* ignore */ });
  }, [id, accessToken]);

  async function handleBook(): Promise<void> {
    if (!selectedRoom || !checkin || !checkout) return;

    if (!accessToken) {
      router.push(`/auth?redirect=/hebergement/${id}?checkin=${checkin}&checkout=${checkout}&guests=${guests}`);
      return;
    }

    setIsBooking(true);
    setBookingError("");

    try {
      const res = await apiClient.post<{ id: string; message: string }>("/property-bookings", {
        property_id: id,
        room_type_id: selectedRoom.id,
        checkin,
        checkout,
        guests,
        special_requests: specialRequests || undefined,
      });

      /* Réservation créée — rediriger vers le détail */
      router.push(`/hebergement/mes-reservations/${res.id}?success=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setBookingError(err.message);
      } else {
        setBookingError("Erreur réseau — vérifiez votre connexion.");
      }
    } finally {
      setIsBooking(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🏨</p>
          <p className="font-semibold text-gray-800">Hébergement introuvable</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-[#1A6B3A] font-semibold"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  const hasDateSearch = Boolean(checkin && checkout);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* En-tête */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{property.name}</p>
          <p className="text-xs text-gray-500">{property.city.name}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Infos principales */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          {/* Nom + type + étoiles */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <h1 className="font-bold text-gray-900 text-xl flex-1 leading-tight">{property.name}</h1>
            {property.rating_avg && (
              <span className="bg-[#1A6B3A]/10 text-[#1A6B3A] text-sm font-bold px-2 py-1 rounded-xl">
                ★ {property.rating_avg.toFixed(1)}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500 mb-2">{property.address}</p>

          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-sm text-gray-600 font-medium">
              {PROPERTY_TYPE_LABELS[property.property_type] ?? property.property_type}
            </span>
            {property.star_rating && (
              <span className="text-[#F5A623]">
                {"★".repeat(property.star_rating)}{"☆".repeat(5 - property.star_rating)}
              </span>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <p className="text-sm text-gray-700 leading-relaxed">{property.description}</p>
          )}
        </div>

        {/* Infos pratiques */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-3">Informations pratiques</h2>
          <div className="space-y-2 text-sm">
            <InfoRow icon="🕒" label="Check-in" value={property.check_in_time} />
            <InfoRow icon="🕑" label="Check-out" value={property.check_out_time} />
            <InfoRow icon="📍" label="Adresse" value={property.address} />
            <InfoRow icon="📞" label="Téléphone" value={property.phone} />
            {property.email && <InfoRow icon="✉️" label="Email" value={property.email} />}
          </div>

          {property.cancellation_policy && (
            <div className="mt-3 bg-amber-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Politique d'annulation</p>
              <p className="text-xs text-amber-600">{property.cancellation_policy}</p>
            </div>
          )}
        </div>

        {/* Équipements */}
        {property.amenities.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-3">Équipements</h2>
            <div className="flex flex-wrap gap-2">
              {property.amenities.map((a) => (
                <span key={a} className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Avis */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">
              Avis{reviewsTotal > 0 ? ` (${reviewsTotal})` : ""}
            </h2>
            {eligibility?.can_review && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="text-sm font-semibold text-[#1A6B3A]"
              >
                + Laisser un avis
              </button>
            )}
            {eligibility?.already_reviewed && (
              <span className="text-xs text-gray-400 font-medium">Déjà noté</span>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-gray-400 text-sm">Aucun avis pour le moment</p>
              {eligibility?.can_review && (
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="mt-1 text-sm font-semibold text-[#1A6B3A]"
                >
                  Soyez le premier à noter !
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.slice(0, 5).map((r) => (
                <PropertyReviewCard key={r.id} review={r} />
              ))}
              {reviewsTotal > 5 && (
                <p className="text-center text-xs text-gray-400 pt-1">
                  + {reviewsTotal - 5} avis supplémentaire{reviewsTotal - 5 > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Recherche résumée (si dates) */}
        {hasDateSearch && (
          <div className="bg-[#1A6B3A]/5 rounded-2xl p-4">
            <p className="text-xs font-semibold text-[#1A6B3A] mb-1">Votre recherche</p>
            <p className="text-sm text-gray-700">
              {checkin} → {checkout}
              {" · "}{guests} voyageur{guests > 1 ? "s" : ""}
              {property.nights ? ` · ${property.nights} nuit${property.nights > 1 ? "s" : ""}` : ""}
            </p>
          </div>
        )}

        {/* Types de chambres */}
        <div>
          <h2 className="font-bold text-gray-900 mb-3">
            {hasDateSearch ? "Chambres disponibles" : "Nos chambres"}
          </h2>

          {property.room_types.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <p className="text-gray-500">Aucune chambre disponible pour ces critères</p>
              <button
                onClick={() => router.push("/hebergement")}
                className="mt-3 text-[#1A6B3A] font-semibold text-sm"
              >
                Modifier la recherche
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {property.room_types.map((room) => {
                const isUnavailable = hasDateSearch && room.available !== undefined && room.available <= 0;
                const isSelected = selectedRoom?.id === room.id;

                return (
                  <button
                    key={room.id}
                    onClick={() => {
                      if (isUnavailable) return;
                      setSelectedRoom(isSelected ? null : room);
                      setShowBookingModal(false);
                    }}
                    disabled={isUnavailable}
                    className={`w-full rounded-2xl p-4 text-left border-2 transition-all ${
                      isUnavailable
                        ? "bg-gray-100 border-gray-200 opacity-60"
                        : isSelected
                          ? "bg-[#1A6B3A]/5 border-[#1A6B3A] shadow-md"
                          : "bg-white border-gray-100 shadow-sm active:scale-[0.99]"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-sm">{room.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {BED_TYPES[room.bed_type] ?? room.bed_type}
                          {" · "}{room.max_occupancy} pers. max
                        </p>
                        {room.description && (
                          <p className="text-xs text-gray-600 mt-1">{room.description}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-[#1A6B3A] text-sm">
                          {formatFCFA(room.price_per_night)}/nuit
                        </p>
                        {hasDateSearch && room.total_for_stay && (
                          <p className="text-xs text-gray-500">
                            {formatFCFA(room.total_for_stay)} total
                          </p>
                        )}
                        {hasDateSearch && room.available !== undefined && (
                          <p className={`text-xs font-semibold mt-0.5 ${
                            isUnavailable ? "text-red-500" : "text-green-600"
                          }`}>
                            {isUnavailable ? "Complet" : `${room.available} dispo.`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Équipements chambre */}
                    {room.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {room.amenities.slice(0, 4).map((a) => (
                          <span key={a} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                            {a}
                          </span>
                        ))}
                        {room.amenities.length > 4 && (
                          <span className="text-xs text-gray-400">+{room.amenities.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Indicateur de sélection */}
                    {isSelected && (
                      <p className="text-xs font-semibold text-[#1A6B3A] mt-2">✓ Chambre sélectionnée</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Barre de réservation fixe en bas */}
      {selectedRoom && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500">Chambre sélectionnée</p>
              <p className="font-bold text-gray-900 text-sm">{selectedRoom.name}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#1A6B3A]">
                {hasDateSearch && selectedRoom.total_for_stay
                  ? formatFCFA(selectedRoom.total_for_stay)
                  : `${formatFCFA(selectedRoom.price_per_night)}/nuit`}
              </p>
              {hasDateSearch && property.nights && (
                <p className="text-xs text-gray-500">{property.nights} nuit{property.nights > 1 ? "s" : ""}</p>
              )}
            </div>
          </div>

          {hasDateSearch ? (
            <button
              onClick={() => setShowBookingModal(true)}
              className="w-full bg-[#1A6B3A] text-white font-bold py-4 rounded-xl text-base active:scale-95 transition-all"
            >
              Réserver cette chambre
            </button>
          ) : (
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xs text-amber-700 font-medium">
                Ajoutez vos dates pour finaliser la réservation
              </p>
              <button
                onClick={() => router.push("/hebergement")}
                className="text-amber-700 font-bold text-xs mt-1 underline"
              >
                Choisir des dates →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal soumettre un avis */}
      {showReviewModal && property && (
        <PropertyReviewModal
          propertyId={id}
          propertyName={property.name}
          {...(eligibility?.booking_ref_id ? { bookingRefId: eligibility.booking_ref_id } : {})}
          onClose={() => setShowReviewModal(false)}
          onSubmitted={() => {
            setShowReviewModal(false);
            setEligibility({ can_review: false, already_reviewed: true });
            loadReviews();
          }}
        />
      )}

      {/* Modal de confirmation de réservation */}
      {showBookingModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="font-bold text-xl text-gray-900 mb-4">Confirmer la réservation</h2>

            <div className="space-y-3 mb-5">
              <ConfirmRow label="Hébergement" value={property.name} />
              <ConfirmRow label="Chambre" value={selectedRoom.name} />
              <ConfirmRow label="Arrivée" value={checkin} />
              <ConfirmRow label="Départ" value={checkout} />
              <ConfirmRow
                label="Durée"
                value={`${property.nights} nuit${(property.nights ?? 0) > 1 ? "s" : ""}`}
              />
              <ConfirmRow label="Voyageurs" value={`${guests} personne${guests > 1 ? "s" : ""}`} />
              <ConfirmRow
                label="Total"
                value={selectedRoom.total_for_stay ? formatFCFA(selectedRoom.total_for_stay) : "—"}
                bold
              />
            </div>

            {/* Requêtes spéciales */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                Demandes spéciales (optionnel)
              </label>
              <textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="Ex : chambre non-fumeur, lit bébé, étage élevé..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30 resize-none h-20"
              />
            </div>

            {bookingError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-red-700">{bookingError}</p>
              </div>
            )}

            <button
              onClick={() => void handleBook()}
              disabled={isBooking}
              className="w-full bg-[#1A6B3A] text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition-all mb-3"
            >
              {isBooking ? "Réservation en cours..." : "Confirmer la réservation"}
            </button>
            <button
              onClick={() => { setShowBookingModal(false); setBookingError(""); }}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * COMPOSANTS AVIS
 * ============================================================ */

function PropertyReviewCard({ review }: { review: Review }): React.ReactElement {
  const date = new Date(review.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <span className="font-semibold text-gray-900 text-sm">{review.author}</span>
          {review.is_verified && (
            <span className="ml-2 text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-full">
              ✓ Séjour vérifié
            </span>
          )}
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={`text-sm ${star <= review.rating ? "text-[#F5A623]" : "text-gray-200"}`}>
              ★
            </span>
          ))}
        </div>
      </div>
      {review.title && <p className="text-sm font-semibold text-gray-800 mb-0.5">{review.title}</p>}
      {review.comment && <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>}
      <p className="text-xs text-gray-400 mt-1.5">{date}</p>
    </div>
  );
}

function PropertyReviewModal({
  propertyId,
  propertyName,
  bookingRefId,
  onClose,
  onSubmitted,
}: {
  propertyId:    string;
  propertyName:  string;
  bookingRefId?: string;
  onClose:       () => void;
  onSubmitted:   () => void;
}): React.ReactElement {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle]     = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (rating === 0) { setError("Choisissez une note entre 1 et 5 étoiles"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/reviews", {
        entity_type: "property",
        entity_id:   propertyId,
        rating,
        ...(title.trim()   ? { title: title.trim() }     : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(bookingRefId   ? { booking_ref_id: bookingRefId } : {}),
      });
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Erreur réseau — réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-xl text-gray-900">Noter {propertyName}</h2>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Votre note</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className={`text-4xl transition-transform active:scale-90 ${
                  star <= (hovered || rating) ? "text-[#F5A623]" : "text-gray-200"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {["", "Très mauvais", "Mauvais", "Correct", "Bien", "Excellent"][rating]}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Titre <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ex : Séjour agréable, personnel accueillant"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Commentaire <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Décrivez votre séjour..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]/30 resize-none"
          />
        </div>

        {bookingRefId && (
          <p className="text-xs text-green-600 bg-green-50 rounded-xl px-3 py-2 font-medium">
            ✓ Votre avis sera marqué "Séjour vérifié"
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => void handleSubmit()}
          disabled={saving || rating === 0}
          className="w-full bg-[#1A6B3A] text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
        >
          {saving ? "Publication en cours…" : "Publier mon avis"}
        </button>
        <button
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * MINI-COMPOSANTS
 * ============================================================ */

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value, bold }: { label: string; value: string; bold?: boolean }): React.ReactElement {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-[#1A6B3A] text-base" : "font-semibold text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}

/* ============================================================
 * EXPORT DEFAULT — params via props (App Router)
 * ============================================================ */

export default function PropertyDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PropertyDetailContent id={params.id} />
    </Suspense>
  );
}
