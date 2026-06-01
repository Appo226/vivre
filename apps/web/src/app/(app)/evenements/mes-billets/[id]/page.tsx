"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/mes-billets/[id]/page.tsx — EV_003 : Billet d'événement avec QR code
 *
 * Billet numérique scannable à l'entrée de l'événement.
 * Même design "ticket" que les billets de transport pour cohérence.
 */

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface EventBookingDetail {
  id: string;
  user_id: string;
  quantity: number;
  unit_price_fcfa: number;
  total_amount: number;
  commission_fcfa: number;
  status: string;
  qr_code: string;
  checked_in_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  created_at: string;
  ticket_type: { id: string; name: string; description?: string };
  event: {
    id: string;
    title: string;
    cover_url?: string;
    venue_name: string;
    venue_address: string;
    starts_at: string;
    ends_at: string;
    latitude?: number;
    longitude?: number;
    city: { name: string };
    organizer: { first_name?: string; last_name?: string; phone: string };
  };
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "En attente de paiement", color: "text-amber-700 bg-amber-50 border-amber-200", icon: "⏳" },
  confirmed: { label: "Confirmé — Prêt à entrer", color: "text-green-700 bg-green-50 border-green-200", icon: "✅" },
  cancelled: { label: "Annulé", color: "text-red-700 bg-red-50 border-red-200", icon: "❌" },
  checked_in: { label: "Utilisé — Entrée validée", color: "text-gray-600 bg-gray-50 border-gray-200", icon: "✓" },
};

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function EventBilletPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payMethod,     setPayMethod]     = useState("orange_money");
  const [isPaying,      setIsPaying]      = useState(false);
  const [payError,      setPayError]      = useState("");

  useEffect(() => {
    apiClient.get<{ balance_fcfa: number }>("/users/me/wallet")
      .then((r) => setWalletBalance(r.balance_fcfa))
      .catch(() => {});
  }, []);

  async function handlePay(): Promise<void> {
    if (!booking) return;
    setIsPaying(true); setPayError("");
    try {
      if (payMethod === "wallet") {
        await apiClient.post("/payments/wallet/pay", { booking_type: "event", booking_id: booking.id });
        void queryClient.invalidateQueries({ queryKey: ["event-booking", id] });
      } else {
        const res = await apiClient.post<{ payment_url: string }>(
          "/payments/initiate", { booking_type: "event", booking_id: booking.id }
        );
        window.location.href = res.payment_url;
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setIsPaying(false); }
  }

  const { data: booking, isLoading, isError } = useQuery<EventBookingDetail>({
    queryKey: ["event-booking", id],
    queryFn: () => apiClient.get<EventBookingDetail>(`/events/bookings/${id}`),
    staleTime: 5 * 60 * 1000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.delete<{ message: string }>(`/events/bookings/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["event-bookings"] });
      setShowCancelConfirm(false);
    },
    onError: (err) => {
      setCancelError(err instanceof ApiError ? err.message : "Impossible d'annuler");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Billet introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-[#1A6B3A] text-sm">Retour</button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[booking.status] ?? {
    label: booking.status, color: "text-gray-600 bg-gray-50 border-gray-200", icon: "•",
  };

  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    new Date(booking.event.starts_at) > new Date(Date.now() + 24 * 60 * 60 * 1000);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* En-tête */}
      <div
        className="px-4 pt-12 pb-6"
        style={{ background: "linear-gradient(135deg, #1A1A2E, #1A6B3A)" }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/70 text-sm mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Mes billets
        </button>
        <h1 className="text-white text-xl font-bold">{booking.event.title}</h1>
        <p className="text-white/70 text-sm mt-0.5 capitalize">
          {formatFullDate(booking.event.starts_at)}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Statut */}
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
                  className={["w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    walletBalance < booking.total_amount ? "border-gray-100 opacity-50 cursor-not-allowed"
                      : payMethod === "wallet" ? "border-[#1A6B3A] bg-green-50" : "border-gray-200"].join(" ")}
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
                { v: "orange_money",  l: "Orange Money",  i: "🟠" },
                { v: "moov",          l: "Moov Money",    i: "🔵" },
                { v: "telecel_money", l: "Telecel Money", i: "🟣" },
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
          {/* Header ticket */}
          <div style={{ background: "linear-gradient(135deg, #1A1A2E, #1A6B3A)" }}
            className="px-5 py-4">
            <p className="text-white/70 text-xs">Type de billet</p>
            <p className="text-white font-bold text-xl">{booking.ticket_type.name}</p>
            {booking.ticket_type.description && (
              <p className="text-white/60 text-xs mt-1">{booking.ticket_type.description}</p>
            )}
          </div>

          {/* Séparateur ticket style */}
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-gray-50 -ml-2.5" />
            <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
            <div className="w-5 h-5 rounded-full bg-gray-50 -mr-2.5" />
          </div>

          {/* Corps */}
          <div className="px-5 py-4">
            {/* Événement */}
            <div className="space-y-2 mb-4">
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{booking.event.venue_name}</p>
                  <p className="text-xs text-gray-500">{booking.event.city.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-700">
                  {formatTime(booking.event.starts_at)} → {formatTime(booking.event.ends_at)}
                </p>
              </div>
            </div>

            {/* Infos billet */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Quantité</p>
                <p className="font-bold text-gray-900 mt-0.5">{booking.quantity} billet{booking.quantity > 1 ? "s" : ""}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Montant</p>
                <p className="font-bold text-[#1A6B3A] mt-0.5">
                  {booking.total_amount === 0 ? "Gratuit" : `${booking.total_amount.toLocaleString("fr-FR")} FCFA`}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 col-span-2">
                <p className="text-xs text-gray-400">Référence</p>
                <p className="font-mono text-xs text-gray-700 mt-0.5">{booking.id}</p>
              </div>
            </div>

            {/* Séparateur */}
            <div className="flex items-center mb-4">
              <div className="w-5 h-5 rounded-full bg-gray-50 -ml-7" />
              <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
              <div className="w-5 h-5 rounded-full bg-gray-50 -mr-7" />
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center py-2">
              <p className="text-xs text-gray-400 mb-3 text-center">
                Présentez ce QR code à l'entrée de l'événement
              </p>
              {booking.status === "cancelled" ? (
                <div className="relative p-4 bg-gray-100 rounded-2xl opacity-40">
                  <QRCodeSVG value={booking.qr_code} size={180} level="M" fgColor="#1A1A2E" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 text-white text-xs font-bold px-4 py-1 rounded rotate-[-15deg] shadow-lg">
                      ANNULÉ
                    </div>
                  </div>
                </div>
              ) : booking.status === "checked_in" ? (
                <div className="relative p-4 bg-green-50 rounded-2xl border-2 border-green-400">
                  <QRCodeSVG value={booking.qr_code} size={180} level="M" fgColor="#1A1A2E" bgColor="#F0FDF4" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-green-500 text-white text-xs font-bold px-4 py-1 rounded rotate-[-10deg] shadow-lg">
                      ✓ UTILISÉ
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-white border-2 border-gray-100 rounded-2xl shadow-inner">
                  <QRCodeSVG
                    value={booking.qr_code}
                    size={200}
                    level="M"
                    fgColor="#1A1A2E"
                    bgColor="#FFFFFF"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contact organisateur */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-2">Organisateur</p>
          <div className="flex items-center gap-3">
            <p className="text-gray-700 text-sm flex-1">
              {[booking.event.organizer.first_name, booking.event.organizer.last_name]
                .filter(Boolean)
                .join(" ") || "Organisateur VIVRE"}
            </p>
            <a
              href={`tel:${booking.event.organizer.phone}`}
              className="text-[#1A6B3A] font-medium text-sm"
            >
              {booking.event.organizer.phone}
            </a>
          </div>
        </div>

        {/* Bouton annulation */}
        {canCancel && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="w-full py-3 border-2 border-red-200 text-red-600 font-semibold rounded-2xl"
          >
            Annuler ce billet
          </button>
        )}
      </div>

      {/* Modal confirmation annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-3xl px-4 py-6">
            <h2 className="text-lg font-bold mb-2">Confirmer l'annulation</h2>
            <p className="text-sm text-gray-500 mb-4">
              Politique d'annulation : remboursement possible si annulé 24h avant l'événement.
            </p>
            {cancelError && <p className="text-red-600 text-sm mb-3">{cancelError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(""); }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold"
              >
                Garder
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold disabled:opacity-60"
              >
                {cancelMutation.isPending ? "..." : "Annuler"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
