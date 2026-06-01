"use client";

export const dynamic = "force-dynamic";

/**
 * transport/mes-billets/[id]/page.tsx — TI_006 : Détail d'un billet + QR code
 *
 * Affiche le billet numérique complet :
 *   1. Résumé du voyage (compagnie, trajet, horaires, sièges)
 *   2. QR code pour validation à l'embarquement
 *   3. Informations de contact de la compagnie
 *   4. Bouton d'annulation (si voyage futur et délai > 2h)
 *
 * QR code :
 *   Le champ qr_code de l'API contient les données encodées en base64.
 *   qrcode.react les affiche comme QR code scannable par le validateur de la compagnie.
 *
 * Le validateur de la compagnie scannera le QR → décode base64 → vérifie bookingId
 * via GET /transport/bookings/:id (ou app mobile validateur dédiée — futur).
 */

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface BookingDetail {
  id: string;
  seat_numbers: string[];
  passenger_count: number;
  passenger_type: string;
  total_amount: number;
  status: string;
  qr_code: string;
  cancelled_at?: string;
  cancellation_reason?: string;
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
    company: {
      id: string;
      name: string;
      logo_url?: string;
      phone: string;
      address: string;
    };
  };
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
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

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "En attente de paiement", color: "text-amber-700 bg-amber-50 border-amber-200", icon: "⏳" },
  confirmed: { label: "Confirmé — Prêt à embarquer", color: "text-green-700 bg-green-50 border-green-200", icon: "✅" },
  cancelled: { label: "Annulé", color: "text-red-700 bg-red-50 border-red-200", icon: "❌" },
  completed: { label: "Voyage effectué", color: "text-gray-600 bg-gray-50 border-gray-200", icon: "✓" },
};

const PASSENGER_TYPE_LABELS: Record<string, string> = {
  adult: "Adulte",
  child: "Enfant",
  student: "Étudiant",
};

const BUS_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  confort: "Confort",
  vip: "VIP",
  minibus: "Minibus",
};

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function BilletDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [refundMethod, setRefundMethod] = useState<"vivre_credit" | "mobile_money">("vivre_credit");
  const [cancelSuccess, setCancelSuccess] = useState<{ refund_amount: number; refund_method: string | null; message: string } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payMethod,     setPayMethod]     = useState("orange_money");
  const [isPaying,      setIsPaying]      = useState(false);
  const [payError,      setPayError]      = useState("");

  useEffect(() => {
    apiClient
      .get<{ balance_fcfa: number }>("/users/me/wallet")
      .then((r) => setWalletBalance(r.balance_fcfa))
      .catch(() => {});
  }, []);

  async function handlePay(): Promise<void> {
    if (!booking) return;
    setIsPaying(true);
    setPayError("");
    try {
      if (payMethod === "wallet") {
        await apiClient.post("/payments/wallet/pay", {
          booking_type: "transport",
          booking_id:   booking.id,
        });
        void queryClient.invalidateQueries({ queryKey: ["booking", id] });
      } else {
        const res = await apiClient.post<{ payment_url: string }>(
          "/payments/initiate",
          { booking_type: "transport", booking_id: booking.id }
        );
        window.location.href = res.payment_url;
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setIsPaying(false);
    }
  }

  const { data: booking, isLoading, isError } = useQuery<BookingDetail>({
    queryKey: ["booking", id],
    queryFn: () => apiClient.get<BookingDetail>(`/transport/bookings/${id}`),
    staleTime: 5 * 60 * 1000, /* 5 minutes */
  });

  /* Mutation d'annulation — utilise le nouvel endpoint avec remboursement */
  const cancelMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ cancelled: boolean; refund_amount: number; refund_method: string | null; message: string }>(
        `/transport-bookings/${id}/cancel`,
        { reason: cancelReason || undefined, refund_method: refundMethod }
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      setCancelSuccess(result);
      setShowCancelConfirm(false);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setCancelError(err.message);
      } else {
        setCancelError("Impossible d'annuler pour le moment");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#1A6B3A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement du billet...</p>
        </div>
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Billet introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-[#1A6B3A] text-sm font-medium">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[booking.status] ?? {
    label: booking.status,
    color: "text-gray-600 bg-gray-50 border-gray-200",
    icon: "•",
  };

  /*
   * Vérifier si l'annulation est encore possible.
   * La règle métier (2h avant départ) est aussi vérifiée côté API,
   * mais on cache le bouton côté client pour éviter des erreurs inutiles.
   */
  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    new Date(booking.trip.departure_datetime) > new Date(Date.now() + 2 * 60 * 60 * 1000);

  /*
   * Le QR code contient les données encodées en base64 par l'API.
   * On passe la string base64 directement à QRCodeSVG comme valeur.
   * La taille 200px est optimale pour être scannable depuis un écran de téléphone.
   */
  const qrValue = booking.qr_code;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* En-tête */}
      <div className="bg-[#1A6B3A] px-4 pt-12 pb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-green-200 text-sm mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Mes billets
        </button>
        <h1 className="text-white text-xl font-bold">
          {booking.trip.origin_city} → {booking.trip.destination_city}
        </h1>
        <p className="text-green-200 text-sm mt-0.5 capitalize">
          {formatDate(booking.trip.departure_datetime)}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Badge statut */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border ${statusConfig.color}`}>
          <span>{statusConfig.icon}</span>
          <p className="font-semibold text-sm">{statusConfig.label}</p>
        </div>

        {/* Paiement — si billet en attente de paiement */}
        {(booking.status === "pending" || booking.status === "pending_payment") && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
            <p className="font-bold text-gray-900 mb-1">Finaliser le paiement</p>
            <p className="text-sm text-gray-500 mb-4">
              Total : <span className="font-bold text-gray-900">{new Intl.NumberFormat("fr-FR").format(booking.total_amount)} FCFA</span>
            </p>
            <div className="space-y-2 mb-4">
              {walletBalance !== null && (
                <button
                  onClick={() => walletBalance >= booking.total_amount && setPayMethod("wallet")}
                  disabled={walletBalance < booking.total_amount}
                  className={[
                    "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    walletBalance < booking.total_amount ? "border-gray-100 opacity-50 cursor-not-allowed"
                      : payMethod === "wallet" ? "border-[#1A6B3A] bg-green-50" : "border-gray-200",
                  ].join(" ")}
                >
                  <span className="text-xl">💰</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Portefeuille VIVRE</p>
                    <p className="text-xs text-gray-500">
                      {walletBalance.toLocaleString("fr-FR")} FCFA{walletBalance < booking.total_amount && " — insuffisant"}
                    </p>
                  </div>
                  {payMethod === "wallet" && <span className="text-green-700 font-bold text-sm">✓</span>}
                </button>
              )}
              {[
                { v: "orange_money", l: "Orange Money", i: "🟠" },
                { v: "moov",         l: "Moov Money",   i: "🔵" },
                { v: "telecel_money",l: "Telecel Money", i: "🟣" },
              ].map((m) => (
                <button key={m.v} onClick={() => setPayMethod(m.v)}
                  className={["w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    payMethod === m.v ? "border-[#1A6B3A] bg-green-50" : "border-gray-200"].join(" ")}>
                  <span className="text-xl">{m.i}</span>
                  <p className="font-semibold text-gray-900 text-sm flex-1">{m.l}</p>
                  {payMethod === m.v && <span className="text-green-700 font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
            {payError && <p className="text-xs text-red-600 mb-3">{payError}</p>}
            <button onClick={() => void handlePay()} disabled={isPaying}
              className="w-full bg-[#1A6B3A] text-white font-bold py-3.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all">
              {isPaying
                ? (payMethod === "wallet" ? "Paiement…" : "Redirection…")
                : `Payer ${new Intl.NumberFormat("fr-FR").format(booking.total_amount)} FCFA`}
            </button>
          </div>
        )}

        {/* Billet visuel */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Ticket header — style billet de bus */}
          <div className="bg-[#1A6B3A] px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-white text-xs opacity-75">Compagnie</p>
              <p className="text-white font-bold text-lg">{booking.trip.company.name}</p>
            </div>
            <div className="text-right">
              <p className="text-green-200 text-xs">
                {BUS_TYPE_LABELS[booking.trip.bus_type] ?? booking.trip.bus_type}
              </p>
              <p className="text-white font-bold">
                {booking.trip.distance_km} km
              </p>
            </div>
          </div>

          {/* Ligne pointillée — séparation ticket style */}
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-gray-50 -ml-2.5 flex-shrink-0" />
            <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
            <div className="w-5 h-5 rounded-full bg-gray-50 -mr-2.5 flex-shrink-0" />
          </div>

          {/* Corps du billet */}
          <div className="px-5 py-4">
            {/* Horaires */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatTime(booking.trip.departure_datetime)}
                </p>
                <p className="text-sm text-gray-500">{booking.trip.origin_city}</p>
              </div>
              <div className="flex flex-col items-center px-4">
                <p className="text-xs text-gray-400">{formatDuration(booking.trip.duration_minutes)}</p>
                <div className="w-12 h-px bg-gray-300 my-1" />
                <p className="text-xs text-gray-400">→</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">
                  {formatTime(booking.trip.arrival_datetime)}
                </p>
                <p className="text-sm text-gray-500">{booking.trip.destination_city}</p>
              </div>
            </div>

            {/* Infos passager */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Sièges</p>
                <p className="font-bold text-gray-900 mt-0.5">
                  {booking.seat_numbers.join(", ")}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Passager</p>
                <p className="font-bold text-gray-900 mt-0.5">
                  {booking.passenger_count}×{" "}
                  {PASSENGER_TYPE_LABELS[booking.passenger_type] ?? booking.passenger_type}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Montant</p>
                <p className="font-bold text-[#1A6B3A] mt-0.5">
                  {booking.total_amount.toLocaleString("fr-FR")} FCFA
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Référence</p>
                <p className="font-mono text-xs text-gray-700 mt-0.5 truncate">
                  {booking.id.split("-")[0]?.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Deuxième ligne pointillée avant le QR */}
            <div className="flex items-center mb-4">
              <div className="w-5 h-5 rounded-full bg-gray-50 -ml-7 flex-shrink-0" />
              <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
              <div className="w-5 h-5 rounded-full bg-gray-50 -mr-7 flex-shrink-0" />
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center py-2">
              <p className="text-xs text-gray-400 mb-3 text-center">
                Présentez ce QR code à l'embarquement
              </p>
              {booking.status !== "cancelled" ? (
                <div className="p-4 bg-white border-2 border-gray-100 rounded-2xl shadow-inner">
                  <QRCodeSVG
                    value={qrValue}
                    size={180}
                    level="M"
                    includeMargin={false}
                    /*
                     * On utilise les couleurs VIVRE pour le QR.
                     * fgColor = couleur des modules (vert VIVRE).
                     * bgColor = fond blanc.
                     */
                    fgColor="#1A6B3A"
                    bgColor="#FFFFFF"
                  />
                </div>
              ) : (
                /* QR code barré si billet annulé */
                <div className="relative p-4 bg-gray-100 rounded-2xl opacity-40">
                  <QRCodeSVG value={qrValue} size={180} level="M" includeMargin={false} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 text-white text-xs font-bold px-4 py-1 rounded rotate-[-15deg] shadow-lg">
                      ANNULÉ
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Infos compagnie */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">Contact compagnie</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <a href={`tel:${booking.trip.company.phone}`} className="text-[#1A6B3A] font-medium text-sm">
                {booking.trip.company.phone}
              </a>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-600 text-sm">{booking.trip.company.address}</p>
            </div>
          </div>
        </div>

        {/* Bouton annulation */}
        {canCancel && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="w-full py-3 border-2 border-red-200 text-red-600 font-semibold rounded-2xl hover:bg-red-50 transition-colors"
          >
            Annuler la réservation
          </button>
        )}

        {/* Motif d'annulation si annulé */}
        {booking.status === "cancelled" && booking.cancellation_reason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm font-semibold text-red-700">Motif d'annulation</p>
            <p className="text-sm text-red-600 mt-1">{booking.cancellation_reason}</p>
          </div>
        )}
      </div>

      {/* Résultat annulation réussie */}
      {cancelSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl px-4 py-6 text-center">
            <span className="text-4xl">✅</span>
            <h2 className="text-lg font-bold text-gray-900 mt-3 mb-2">Billet annulé</h2>
            <p className="text-sm text-gray-600 mb-1">{cancelSuccess.message}</p>
            {cancelSuccess.refund_amount > 0 && (
              <p className="text-green-700 font-jakarta font-bold text-base mt-2">
                {cancelSuccess.refund_amount.toLocaleString()} FCFA remboursés
              </p>
            )}
            <button
              onClick={() => { setCancelSuccess(null); router.back(); }}
              className="mt-5 w-full py-3 bg-green-700 text-white rounded-xl font-semibold"
            >
              Retour à mes billets
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl px-4 py-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Annuler ce billet ?</h2>
            <p className="text-sm text-gray-500 mb-4">
              Le remboursement dépend de la politique de la compagnie et du délai avant départ.
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
            {cancelError && <p className="text-red-600 text-sm mb-3">{cancelError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(""); }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold"
              >
                Conserver
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-60"
              >
                {cancelMutation.isPending ? "Annulation..." : "Annuler le billet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
