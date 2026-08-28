"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/mes-billets/[id]/page.tsx — EV_003 : Billet d'événement avec QR code
 *
 * Billet numérique scannable à l'entrée de l'événement.
 * Même design "ticket" que les billets de transport pour cohérence.
 */

import React, { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { apiClient, ApiError } from "@/lib/api";
import { VivreLogo } from "@/components/VivreLogo";

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
  manual_payment_instructions: { provider: string; phone: string; account_name: string } | null;
  user: { first_name: string | null; last_name: string | null; phone: string };
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

const PROVIDER_LABELS: Record<string, string> = {
  orange_money: "Orange Money",
  moov: "Moov Money",
  telecel_money: "Telecel Money",
  wave: "Wave",
};

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
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferSent, setTransferSent] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [payMethod,     setPayMethod]     = useState("orange_money");
  const [isPaying,      setIsPaying]      = useState(false);
  const [payError,      setPayError]      = useState("");
  const ticketCardRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleSaveTicket(): Promise<void> {
    if (!ticketCardRef.current || !booking) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ticketCardRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Échec de la génération de l'image");

      const filename = `billet-vivre-${booking.event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: booking.event.title });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Utilisateur a fermé la feuille de partage — pas une erreur.
      } else {
        setSaveError("Impossible d'enregistrer le billet. Réessayez.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePay(): Promise<void> {
    if (!booking) return;
    setIsPaying(true); setPayError("");
    try {
      const res = await apiClient.post<{ payment_url: string }>(
        "/payments/initiate", { booking_type: "event", booking_id: booking.id }
      );
      window.location.href = res.payment_url;
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

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<{ message: string }>(`/events/bookings/${id}/transfer`, { recipient_phone: transferPhone.trim() }),
    onSuccess: () => {
      // Le billet ne nous appartient plus — inutile de revalider ce détail, on repart
      // vers la liste (qui, elle, doit être rafraîchie pour ne plus l'afficher).
      void queryClient.invalidateQueries({ queryKey: ["event-bookings"] });
      setTransferSent(true);
      setTimeout(() => router.push("/evenements/mes-billets"), 1800);
    },
    onError: (err) => {
      setTransferError(err instanceof ApiError ? err.message : "Erreur réseau.");
    },
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ message: string }>(`/events/bookings/${id}/report-issue`, { reason: reportReason.trim() }),
    onSuccess: () => {
      setReportSent(true);
      setShowReportForm(false);
    },
    onError: (err) => {
      setReportError(err instanceof ApiError ? err.message : "Échec de l'envoi du signalement");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex items-center justify-center">
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

  const canTransfer = booking.status === "confirmed" && new Date(booking.event.starts_at) > new Date();

  const eventEndedAt = new Date(booking.event.ends_at);
  const reportDeadline = new Date(eventEndedAt.getTime() + 24 * 60 * 60 * 1000); // T+1 — doit matcher REPORT_WINDOW_HOURS côté API
  const now = new Date();
  const canReportIssue =
    booking.status === "confirmed" && booking.total_amount > 0 && now > eventEndedAt && now < reportDeadline;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 pb-8">
      {/* En-tête */}
      <div className="bg-dark px-4 pt-12 pb-6">
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

        {/* Paiement manuel — pendant la phase pilote, avant que CinetPay soit branché */}
        {(booking.status === "pending" || booking.status === "pending_payment") && booking.manual_payment_instructions && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm border border-amber-200 dark:border-amber-900">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">Finaliser le paiement</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Total : <span className="font-bold text-gray-900 dark:text-gray-100">{new Intl.NumberFormat("fr-FR").format(booking.total_amount)} FCFA</span>
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-sm text-amber-900 font-dm">
                Envoyez ce montant via <span className="font-bold">{PROVIDER_LABELS[booking.manual_payment_instructions.provider] ?? booking.manual_payment_instructions.provider}</span> au numéro :
              </p>
              <p className="text-xl font-bold text-gray-900 font-mono">{booking.manual_payment_instructions.phone}</p>
              <p className="text-xs text-amber-700">Titulaire : {booking.manual_payment_instructions.account_name}</p>
              <p className="text-xs text-amber-700 pt-1">
                Votre billet sera confirmé et le QR code apparaîtra ici dès que l&apos;organisateur aura validé la réception du paiement.
              </p>
            </div>
          </div>
        )}

        {/* Paiement automatique — une fois CinetPay branché */}
        {(booking.status === "pending" || booking.status === "pending_payment") && !booking.manual_payment_instructions && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm border border-amber-200 dark:border-amber-900">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">Finaliser le paiement</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Total : <span className="font-bold text-gray-900 dark:text-gray-100">{new Intl.NumberFormat("fr-FR").format(booking.total_amount)} FCFA</span>
            </p>
            <div className="space-y-2 mb-4">
              {[
                { v: "orange_money",  l: "Orange Money",  i: "🟠" },
                { v: "moov",          l: "Moov Money",    i: "🔵" },
                { v: "telecel_money", l: "Telecel Money", i: "🟣" },
              ].map((m) => (
                <button key={m.v} onClick={() => setPayMethod(m.v)}
                  className={["w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                    payMethod === m.v ? "border-[#1A6B3A] bg-green-50 dark:bg-green-950/30" : "border-gray-200 dark:border-dark-700"].join(" ")}>
                  <span className="text-xl">{m.i}</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex-1">{m.l}</p>
                  {payMethod === m.v && <span className="text-green-700 font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
            {payError && <p className="text-xs text-red-600 mb-3">{payError}</p>}
            <button onClick={() => void handlePay()} disabled={isPaying}
              className="w-full bg-[#1A6B3A] text-white font-bold py-3.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all">
              {isPaying
                ? "Redirection…"
                : `Payer ${new Intl.NumberFormat("fr-FR").format(booking.total_amount)} FCFA`}
            </button>
          </div>
        )}

        {/* Billet visuel — carte VIVRE : fond vert forêt (photo de l'événement en fond
            discret si disponible), mark en ruban, bande de losanges tricolores en pied
            de carte — signature de la charte graphique (voir logo & core documents/). */}
        <div ref={ticketCardRef} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Header ticket */}
          <div
            className="relative px-5 pt-5 pb-4 bg-cover bg-center bg-dark"
            style={booking.event.cover_url ? { backgroundImage: `url(${booking.event.cover_url})` } : undefined}
          >
            {booking.event.cover_url && (
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(15,46,32,0.55), rgba(15,46,32,0.92))" }} />
            )}
            <div className="relative">
              <VivreLogo size={18} variant="light" className="mb-3" />
              <span className="inline-block bg-white/15 backdrop-blur-sm text-white text-[11px] font-jakarta font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2">
                🎟️ {booking.ticket_type.name}
              </span>
              <p className="text-white font-sora font-extrabold text-2xl leading-[1.1] text-balance">{booking.event.title}</p>
              <p className="text-[#F5A623] text-[11px] mt-2.5 font-dm font-semibold uppercase tracking-wider">◆ Billet pour</p>
              <p className="text-white font-jakarta font-bold text-base">
                {[booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || booking.user.phone}
              </p>
              {booking.ticket_type.description && (
                <p className="text-white/60 text-xs mt-1">{booking.ticket_type.description}</p>
              )}
            </div>
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
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-semibold text-gray-900 capitalize">{formatFullDate(booking.event.starts_at)}</p>
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
            </div>

            {/* Infos billet */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">◆ Quantité</p>
                <p className="font-bold text-gray-900 mt-0.5">{booking.quantity} billet{booking.quantity > 1 ? "s" : ""}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">◆ Montant</p>
                <p className="font-bold text-[#1A6B3A] mt-0.5">
                  {booking.total_amount === 0 ? "Gratuit" : `${booking.total_amount.toLocaleString("fr-FR")} FCFA`}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 col-span-2">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">◆ Référence</p>
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
                  <QRCodeSVG value={booking.qr_code} size={180} level="M" fgColor="#0F2E20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-500 text-white text-xs font-bold px-4 py-1 rounded rotate-[-15deg] shadow-lg">
                      ANNULÉ
                    </div>
                  </div>
                </div>
              ) : booking.status === "checked_in" ? (
                <div className="relative p-4 bg-green-50 rounded-2xl border-2 border-green-400">
                  <QRCodeSVG value={booking.qr_code} size={180} level="M" fgColor="#0F2E20" bgColor="#F0FDF4" />
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
                    fgColor="#0F2E20"
                    bgColor="#FFFFFF"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bande de losanges tricolores — signature visuelle du billet VIVRE */}
          <div className="brand-pattern h-3" />
        </div>

        {/* Enregistrer le billet — image PNG du billet, utilisable hors-ligne à l'entrée */}
        {booking.status !== "cancelled" && (
          <div>
            <button
              onClick={() => void handleSaveTicket()}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#1A6B3A] text-white font-semibold rounded-2xl disabled:opacity-60 active:scale-95 transition-all"
            >
              {isSaving ? (
                "Génération…"
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m-9 7h12a2 2 0 002-2V8a2 2 0 00-2-2h-3l-2-2H10L8 6H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Enregistrer le billet
                </>
              )}
            </button>
            {saveError && <p className="text-xs text-red-600 mt-2 text-center">{saveError}</p>}
          </div>
        )}

        {/* Contact organisateur */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Organisateur</p>
          <div className="flex items-center gap-3">
            <p className="text-gray-700 dark:text-gray-300 text-sm flex-1">
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

        {/* Transfert du billet */}
        {canTransfer && !transferSent && !showTransferForm && (
          <button
            onClick={() => setShowTransferForm(true)}
            className="w-full py-3 border-2 border-[#1A6B3A]/30 text-[#1A6B3A] font-semibold rounded-2xl"
          >
            Transférer ce billet
          </button>
        )}

        {showTransferForm && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm border border-[#1A6B3A]/20 space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transférer à qui ?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Le billet passera immédiatement au numéro indiqué — vous n&apos;y aurez plus accès. La personne
              le retrouvera dans « Mes billets » en se connectant avec ce numéro sur VIVRE.
            </p>
            <input
              type="tel"
              inputMode="tel"
              value={transferPhone}
              onChange={(e) => setTransferPhone(e.target.value)}
              placeholder="Numéro du destinataire (ex: 70000000 ou +226...)"
              className="w-full border border-gray-300 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm"
            />
            {transferError && <p className="text-xs text-red-600">{transferError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowTransferForm(false); setTransferError(""); setTransferPhone(""); }}
                className="flex-1 py-2.5 border border-gray-200 dark:border-dark-700 rounded-xl text-sm text-gray-600 dark:text-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (transferPhone.trim().length < 8) { setTransferError("Numéro de téléphone requis."); return; }
                  setTransferError("");
                  transferMutation.mutate();
                }}
                disabled={transferMutation.isPending}
                className="flex-1 py-2.5 bg-[#1A6B3A] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {transferMutation.isPending ? "Transfert…" : "Confirmer"}
              </button>
            </div>
          </div>
        )}

        {transferSent && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800">
            Billet transféré. Redirection vers vos billets…
          </div>
        )}

        {/* Bouton annulation */}
        {canCancel && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="w-full py-3 border-2 border-red-200 text-red-600 font-semibold rounded-2xl"
          >
            Annuler ce billet
          </button>
        )}

        {/* Signaler un problème — événement terminé sans nouvelles officielles de VIVRE */}
        {canReportIssue && !reportSent && !showReportForm && (
          <button
            onClick={() => setShowReportForm(true)}
            className="w-full py-3 border-2 border-amber-200 text-amber-700 font-semibold rounded-2xl"
          >
            Signaler un problème avec cet événement
          </button>
        )}

        {showReportForm && (
          <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm border border-amber-200 dark:border-amber-900 space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Que s&apos;est-il passé ?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ex : l&apos;événement n&apos;a pas eu lieu, le lieu était fermé, aucune communication reçue…
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Décrivez le problème (min. 10 caractères)"
              className="w-full border border-gray-300 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm resize-none h-24"
            />
            {reportError && <p className="text-xs text-red-600">{reportError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowReportForm(false); setReportError(""); }}
                className="flex-1 py-2.5 border border-gray-200 dark:border-dark-700 rounded-xl text-sm text-gray-600 dark:text-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (reportReason.trim().length < 10) { setReportError("Décrivez le problème (min. 10 caractères)."); return; }
                  setReportError("");
                  reportMutation.mutate();
                }}
                disabled={reportMutation.isPending}
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {reportMutation.isPending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        )}

        {reportSent && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800">
            Signalement envoyé. Notre équipe examine votre demande de remboursement.
          </div>
        )}
      </div>

      {/* Modal confirmation annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[60]">
          <div className="w-full bg-white dark:bg-dark-800 rounded-t-3xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
            <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Confirmer l'annulation</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Politique d'annulation : remboursement possible si annulé 24h avant l'événement.
            </p>
            {cancelError && <p className="text-red-600 text-sm mb-3">{cancelError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(""); }}
                className="flex-1 py-3 border border-gray-200 dark:border-dark-700 rounded-xl text-gray-700 dark:text-gray-300 font-semibold"
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
