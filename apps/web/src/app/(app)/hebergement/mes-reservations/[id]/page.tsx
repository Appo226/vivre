"use client";

export const dynamic = "force-dynamic";

/**
 * hebergement/mes-reservations/[id]/page.tsx — HE_005 : Détail d'une réservation
 *
 * Affiche tous les détails d'une réservation hôtelière :
 *   - Informations de l'hébergement (nom, adresse, téléphone)
 *   - Détails de la chambre (type, lit, équipements)
 *   - Dates et montant
 *   - Statut avec code de confirmation
 *   - Bouton annuler (si annulation possible : > 24h avant check-in)
 *
 * Affiche un message de succès si l'utilisateur arrive depuis la réservation
 * (query param ?success=1).
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface BookingDetail {
  id: string;
  user_id: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_amount: number;
  special_requests: string | null;
  status: string;
  cancelled_at: string | null;
  created_at: string;
  room_type: {
    id: string;
    name: string;
    description: string | null;
    bed_type: string;
    max_occupancy: number;
    price_per_night: number;
    amenities: string[];
  };
  property: {
    id: string;
    name: string;
    property_type: string;
    star_rating: number | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    phone: string;
    email: string | null;
    check_in_time: string;
    check_out_time: string;
    cancellation_policy: string | null;
    amenities: string[];
    city: { name: string };
  };
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:    { label: "En attente de confirmation", color: "text-amber-700", bg: "bg-amber-50",  icon: "⏳" },
  confirmed:  { label: "Réservation confirmée",      color: "text-green-700", bg: "bg-green-50",  icon: "✅" },
  checked_in: { label: "En cours de séjour",         color: "text-blue-700",  bg: "bg-blue-50",   icon: "🏨" },
  completed:  { label: "Séjour terminé",              color: "text-gray-600",  bg: "bg-gray-100",  icon: "✓"  },
  cancelled:  { label: "Réservation annulée",        color: "text-red-600",   bg: "bg-red-50",    icon: "✕"  },
};

const BED_TYPES: Record<string, string> = {
  single: "Lit simple", double: "Lit double", twin: "Lits jumeaux", king: "Lit king",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel", auberge: "Auberge", campement: "Campement", private: "Location privée", hostel: "Hostel",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Vérifie si l'annulation est encore possible (> 24h avant le check-in).
 */
function canCancel(status: string, checkInDate: string): boolean {
  if (!["pending", "confirmed"].includes(status)) return false;
  const checkin = new Date(checkInDate);
  const deadline = new Date(checkin.getTime() - 24 * 60 * 60 * 1000); /* 24h avant */
  return new Date() < deadline;
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { success?: string };
}): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  if (!accessToken) {
    router.push("/auth");
    return <></>;
  }

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewRating,  setReviewRating]  = useState(0);
  const [reviewHovered, setReviewHovered] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSent,    setReviewSent]    = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"vivre_credit" | "mobile_money">("vivre_credit");
  const [cancelSuccess, setCancelSuccess] = useState<{ refund_amount: number; message: string } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("orange_money");
  const [isPaying, setIsPaying]     = useState(false);
  const [payError,  setPayError]    = useState("");
  const isSuccess = searchParams.success === "1";

  useEffect(() => {
    apiClient
      .get<BookingDetail>(`/property-bookings/${params.id}`)
      .then((res) => setBooking(res))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
    apiClient
      .get<{ balance_fcfa: number }>("/users/me/wallet")
      .then((r) => setWalletBalance(r.balance_fcfa))
      .catch(() => {});
  }, [params.id]);

  async function handlePay(): Promise<void> {
    if (!booking) return;
    setIsPaying(true);
    setPayError("");
    try {
      if (paymentMethod === "wallet") {
        await apiClient.post("/payments/wallet/pay", {
          booking_type: "property",
          booking_id:   booking.id,
        });
        const updated = await apiClient.get<BookingDetail>(`/property-bookings/${booking.id}`);
        setBooking(updated);
      } else {
        const res = await apiClient.post<{ payment_url: string }>(
          "/payments/initiate",
          { booking_type: "property", booking_id: booking.id }
        );
        window.location.href = res.payment_url;
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setIsPaying(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setIsCancelling(true);
    setCancelError("");
    try {
      const result = await apiClient.post<{ cancelled: boolean; refund_amount: number; message: string }>(
        `/property-bookings/${params.id}/cancel`,
        { reason: cancelReason || undefined, refund_method: refundMethod }
      );
      const updated = await apiClient.get<BookingDetail>(`/property-bookings/${params.id}`);
      setBooking(updated);
      setShowCancelModal(false);
      setCancelSuccess({ refund_amount: result.refund_amount, message: result.message });
    } catch (err) {
      if (err instanceof ApiError) {
        setCancelError(err.message);
      } else {
        setCancelError("Erreur réseau — réessayez.");
      }
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🏨</p>
          <p className="font-semibold text-gray-800">Réservation introuvable</p>
          <button
            onClick={() => router.push("/hebergement/mes-reservations")}
            className="mt-4 text-[#1A6B3A] font-semibold"
          >
            Mes réservations
          </button>
        </div>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["pending"]!;
  const canCancelBooking = canCancel(booking.status, booking.check_in_date);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push("/hebergement/mes-reservations")}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-base">Détail de la réservation</h1>
          <p className="text-xs text-gray-400 font-mono"># {booking.id.slice(-8).toUpperCase()}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Bannière de succès (après nouvelle réservation) */}
        {isSuccess && (
          <div className="bg-green-500 rounded-2xl p-4 text-center text-white">
            <p className="text-2xl mb-1">🎉</p>
            <p className="font-bold text-lg">Réservation créée !</p>
            <p className="text-sm text-white/80 mt-1">
              Finalisez le paiement pour confirmer votre chambre.
            </p>
          </div>
        )}

        {/* Paiement — uniquement si en attente de paiement */}
        {booking.status === "pending_payment" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
            <p className="font-bold text-gray-900 mb-3">Finaliser le paiement</p>
            <p className="text-sm text-gray-500 font-dm mb-4">
              Total : <span className="font-bold text-gray-900">{formatFCFA(booking.total_amount)}</span>
            </p>

            <div className="space-y-2 mb-4">
              {/* Portefeuille */}
              {walletBalance !== null && (
                <button
                  onClick={() => walletBalance >= booking.total_amount && setPaymentMethod("wallet")}
                  disabled={walletBalance < booking.total_amount}
                  className={[
                    "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    walletBalance < booking.total_amount
                      ? "border-gray-100 opacity-50 cursor-not-allowed"
                      : paymentMethod === "wallet"
                        ? "border-[#1A6B3A] bg-green-50"
                        : "border-gray-200",
                  ].join(" ")}
                >
                  <span className="text-xl">💰</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Portefeuille VIVRE</p>
                    <p className="text-xs text-gray-500">
                      Solde : {walletBalance.toLocaleString("fr-FR")} FCFA
                      {walletBalance < booking.total_amount && " — insuffisant"}
                    </p>
                  </div>
                  {paymentMethod === "wallet" && <span className="text-green-700 text-sm font-bold">✓</span>}
                </button>
              )}
              {[
                { v: "orange_money",  l: "Orange Money",  i: "🟠" },
                { v: "moov",          l: "Moov Money",    i: "🔵" },
                { v: "telecel_money", l: "Telecel Money", i: "🟣" },
              ].map((m) => (
                <button
                  key={m.v}
                  onClick={() => setPaymentMethod(m.v)}
                  className={[
                    "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    paymentMethod === m.v ? "border-[#1A6B3A] bg-green-50" : "border-gray-200",
                  ].join(" ")}
                >
                  <span className="text-xl">{m.i}</span>
                  <p className="font-semibold text-gray-900 text-sm flex-1">{m.l}</p>
                  {paymentMethod === m.v && <span className="text-green-700 text-sm font-bold">✓</span>}
                </button>
              ))}
            </div>

            {payError && <p className="text-xs text-red-600 mb-3">{payError}</p>}

            <button
              onClick={() => void handlePay()}
              disabled={isPaying}
              className="w-full bg-[#1A6B3A] text-white font-jakarta font-bold py-3.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
            >
              {isPaying
                ? (paymentMethod === "wallet" ? "Paiement…" : "Redirection…")
                : `Payer ${formatFCFA(booking.total_amount)}`
              }
            </button>
          </div>
        )}

        {/* Statut */}
        <div className={`rounded-2xl p-4 ${statusConf.bg}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{statusConf.icon}</span>
            <div>
              <p className={`font-bold text-sm ${statusConf.color}`}>{statusConf.label}</p>
              {booking.status === "cancelled" && booking.cancelled_at && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Annulée le {formatDate(booking.cancelled_at)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Résumé hébergement */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-gray-900 text-lg mb-1">{booking.property.name}</h2>
          <p className="text-sm text-gray-500 mb-1">
            {PROPERTY_TYPE_LABELS[booking.property.property_type] ?? booking.property.property_type}
            {" · "}{booking.property.city.name}
            {booking.property.star_rating && ` · ${"★".repeat(booking.property.star_rating)}`}
          </p>
          <p className="text-sm text-gray-600">{booking.property.address}</p>
        </div>

        {/* Dates — visuel ticket stub */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-2">
            <div className="p-4 border-r border-dashed border-gray-200">
              <p className="text-xs text-gray-400 mb-1">Arrivée</p>
              <p className="font-bold text-gray-900 text-sm">{formatDate(booking.check_in_date)}</p>
              <p className="text-xs text-[#1A6B3A] font-semibold mt-1">
                dès {booking.property.check_in_time}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-400 mb-1">Départ</p>
              <p className="font-bold text-gray-900 text-sm">{formatDate(booking.check_out_date)}</p>
              <p className="text-xs text-[#1A6B3A] font-semibold mt-1">
                avant {booking.property.check_out_time}
              </p>
            </div>
          </div>
          {/* Separator décoratif style ticket */}
          <div className="h-px bg-dashed border-t border-dashed border-gray-200 mx-4" />
          <div className="px-4 py-3 flex justify-between items-center bg-gray-50">
            <span className="text-sm text-gray-600">
              {booking.nights_count} nuit{booking.nights_count > 1 ? "s" : ""}
              {" · "}{booking.guests_count} voyageur{booking.guests_count > 1 ? "s" : ""}
            </span>
            <span className="font-bold text-[#1A6B3A]">{formatFCFA(booking.total_amount)}</span>
          </div>
        </div>

        {/* Détails chambre */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Votre chambre</h3>
          <p className="font-semibold text-gray-800 mb-1">{booking.room_type.name}</p>
          <p className="text-sm text-gray-500 mb-2">
            {BED_TYPES[booking.room_type.bed_type] ?? booking.room_type.bed_type}
            {" · "}{booking.room_type.max_occupancy} personne{booking.room_type.max_occupancy > 1 ? "s" : ""} max
          </p>
          {booking.room_type.description && (
            <p className="text-sm text-gray-600 mb-3">{booking.room_type.description}</p>
          )}
          <p className="text-sm font-bold text-[#1A6B3A]">
            {formatFCFA(booking.room_type.price_per_night)}/nuit
          </p>
          {booking.room_type.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {booking.room_type.amenities.map((a) => (
                <span key={a} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{a}</span>
              ))}
            </div>
          )}
        </div>

        {/* Équipements de l'hébergement */}
        {booking.property.amenities.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">Équipements de l'hébergement</h3>
            <div className="flex flex-wrap gap-2">
              {booking.property.amenities.map((a) => (
                <span key={a} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Demandes spéciales */}
        {booking.special_requests && (
          <div className="bg-amber-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">Demandes spéciales</p>
            <p className="text-sm text-amber-800">{booking.special_requests}</p>
          </div>
        )}

        {/* Contact hébergement */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Contact</h3>
          <div className="space-y-3">
            <a
              href={`tel:${booking.property.phone}`}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl active:scale-[0.99] transition-all"
            >
              <span className="w-9 h-9 bg-[#1A6B3A]/10 rounded-full flex items-center justify-center text-lg">📞</span>
              <div>
                <p className="text-xs text-gray-400">Téléphone</p>
                <p className="font-semibold text-gray-900 text-sm">{booking.property.phone}</p>
              </div>
            </a>
            {booking.property.email && (
              <a
                href={`mailto:${booking.property.email}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl active:scale-[0.99] transition-all"
              >
                <span className="w-9 h-9 bg-[#1A6B3A]/10 rounded-full flex items-center justify-center text-lg">✉️</span>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="font-semibold text-gray-900 text-sm">{booking.property.email}</p>
                </div>
              </a>
            )}
          </div>
        </div>

        {/* Politique d'annulation */}
        {booking.property.cancellation_policy && (
          <div className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Politique d'annulation
            </p>
            <p className="text-sm text-gray-600">{booking.property.cancellation_policy}</p>
          </div>
        )}

        {/* Bouton annuler */}
        {canCancelBooking && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="w-full border-2 border-red-200 text-red-600 font-semibold py-4 rounded-xl"
          >
            Annuler la réservation
          </button>
        )}

        {/* Message si annulation impossible (trop proche) */}
        {["pending", "confirmed"].includes(booking.status) && !canCancelBooking && (
          <div className="bg-red-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-red-600 mb-1">Annulation impossible</p>
            <p className="text-xs text-red-500">
              L'annulation n'est plus possible moins de 24 heures avant votre arrivée.
              Contactez directement l'hébergement.
            </p>
          </div>
        )}
      </div>

      {/* Section avis — visible après séjour terminé */}
      {booking.status === "completed" && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl p-4 space-y-3">
            {reviewSent ? (
              <div className="text-center py-2">
                <p className="text-2xl mb-1">🙏</p>
                <p className="text-sm font-semibold text-gray-700">Merci pour votre avis !</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  Donner mon avis sur {booking.property.name}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setReviewHovered(star)}
                      onMouseLeave={() => setReviewHovered(0)}
                      onClick={() => setReviewRating(star)}
                      className="text-3xl transition-transform active:scale-110"
                    >
                      <span className={(reviewHovered || reviewRating) >= star ? "text-amber-400" : "text-gray-200"}>
                        ★
                      </span>
                    </button>
                  ))}
                </div>
                {reviewRating > 0 && (
                  <>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Votre commentaire (optionnel)"
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                    />
                    <button
                      onClick={async () => {
                        setReviewSending(true);
                        try {
                          await apiClient.post("/reviews", {
                            entity_type:    "property",
                            entity_id:      booking.property.id,
                            rating:         reviewRating,
                            booking_ref_id: booking.id,
                            ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}),
                          });
                          setReviewSent(true);
                        } catch { /* already reviewed or error — ignore */ }
                        finally { setReviewSending(false); }
                      }}
                      disabled={reviewSending}
                      className="w-full bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
                    >
                      {reviewSending ? "Envoi…" : "Publier mon avis"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Résultat annulation réussie */}
      {cancelSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 text-center">
            <span className="text-4xl">✅</span>
            <h2 className="font-bold text-xl text-gray-900 mt-3 mb-2">Réservation annulée</h2>
            <p className="text-sm text-gray-600 mb-1">{cancelSuccess.message}</p>
            {cancelSuccess.refund_amount > 0 && (
              <p className="text-green-700 font-jakarta font-bold text-base mt-2">
                {cancelSuccess.refund_amount.toLocaleString()} FCFA remboursés
              </p>
            )}
            <button
              onClick={() => { setCancelSuccess(null); router.back(); }}
              className="mt-5 w-full bg-green-700 text-white font-bold py-3 rounded-xl"
            >
              Retour à mes réservations
            </button>
          </div>
        </div>
      )}

      {/* Modal d'annulation */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="font-bold text-xl text-gray-900 mb-1">Annuler la réservation</h2>
            <p className="text-sm text-gray-500 mb-4">
              Le remboursement dépend de la politique de l'hébergement et du délai avant l'arrivée.
            </p>

            {/* Méthode de remboursement */}
            <p className="text-sm font-jakarta font-semibold text-gray-700 mb-2">Méthode de remboursement</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["vivre_credit", "mobile_money"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setRefundMethod(m)}
                  className={[
                    "py-3 px-3 rounded-xl border text-sm font-dm text-left transition-colors",
                    refundMethod === m
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-gray-200 text-gray-600",
                  ].join(" ")}
                >
                  <span className="block font-semibold">
                    {m === "vivre_credit" ? "💳 Crédit VIVRE" : "📱 Mobile Money"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {m === "vivre_credit" ? "Instantané" : "24–48h"}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              placeholder="Raison (optionnel)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />

            {cancelError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-red-700">{cancelError}</p>
              </div>
            )}

            <button
              onClick={() => void handleCancel()}
              disabled={isCancelling}
              className="w-full bg-red-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 mb-3"
            >
              {isCancelling ? "Annulation en cours..." : "Confirmer l'annulation"}
            </button>
            <button
              onClick={() => { setShowCancelModal(false); setCancelError(""); }}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
            >
              Conserver la réservation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
