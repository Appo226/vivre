"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/mes-billets/[id]/page.tsx — Détail d'une commande + ses billets individuels.
 *
 * Une commande de N billets n'affiche plus un unique QR représentant toute la commande —
 * chaque billet a son propre QR, sa propre carte artistique révélée au clic (pas affichée
 * d'emblée en pleine page), et peut être transféré ou annulé indépendamment des autres.
 * `booking.tickets` ne contient QUE les billets que l'appelant détient actuellement dans
 * cette commande (voir GET /api/events/bookings/[id]) — un acheteur qui a cédé 1 de ses 4
 * billets n'en voit plus que 3 ici ; le destinataire du transfert voit son billet en accédant
 * à cette même URL.
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

interface TicketRow {
  id: string;
  ticket_number: number;
  seat_number: number | null; // null = billet non numéroté (l'immense majorité)
  status: string; // "valid" | "checked_in" | "cancelled"
  qr_code: string;
  checked_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  price_fcfa_at_purchase: number;
}

interface EventBookingDetail {
  id: string;
  user_id: string;
  quantity: number;
  unit_price_fcfa: number;
  total_amount: number;
  commission_fcfa: number;
  status: string;
  created_at: string;
  is_original_buyer: boolean;
  tickets: TicketRow[];
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

// Doit rester égal à REFUND_WINDOW_MS dans apps/web/src/lib/events.ts (côté serveur, seul
// juge qui compte) — utilisé ici uniquement pour afficher le compte à rebours à l'acheteur.
const REFUND_WINDOW_MS = 60 * 60 * 1000;

function refundStatus(ticketCreatedAt: string): { eligible: boolean; label: string } {
  const deadline = new Date(ticketCreatedAt).getTime() + REFUND_WINDOW_MS;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    return { eligible: false, label: "Délai de remboursement dépassé (1h après l'achat)" };
  }
  const minutes = Math.ceil(remainingMs / 60000);
  return { eligible: true, label: `Remboursement possible encore ${minutes} min` };
}

const PROVIDER_LABELS: Record<string, string> = {
  orange_money: "Orange Money",
  moov: "Moov Money",
  telecel_money: "Telecel Money",
  wave: "Wave",
};

const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "En attente de paiement", color: "text-amber-700 bg-amber-50 border-amber-200", icon: "⏳" },
  confirmed: { label: "Confirmé — Prêt à entrer", color: "text-green-700 bg-green-50 border-green-200", icon: "✅" },
  cancelled: { label: "Annulé", color: "text-red-700 bg-red-50 border-red-200", icon: "❌" },
};

const TICKET_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  valid: { label: "Prêt à entrer", color: "text-green-700 bg-green-50 border-green-200" },
  checked_in: { label: "Utilisé", color: "text-gray-600 bg-gray-50 border-gray-200" },
  cancelled: { label: "Annulé", color: "text-red-700 bg-red-50 border-red-200" },
};

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function EventBilletPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [payMethod, setPayMethod] = useState("orange_money");
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");

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

  function invalidateAfterTicketChange(): void {
    void queryClient.invalidateQueries({ queryKey: ["event-booking", id] });
    void queryClient.invalidateQueries({ queryKey: ["event-bookings"] });
  }

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

  const statusConfig = BOOKING_STATUS_CONFIG[booking.status] ?? {
    label: booking.status, color: "text-gray-600 bg-gray-50 border-gray-200", icon: "•",
  };

  const eventEndedAt = new Date(booking.event.ends_at);
  const reportDeadline = new Date(eventEndedAt.getTime() + 24 * 60 * 60 * 1000); // T+1 — doit matcher REPORT_WINDOW_HOURS côté API
  const now = new Date();
  const canReportIssue =
    booking.is_original_buyer && booking.status === "confirmed" && booking.total_amount > 0 &&
    now > eventEndedAt && now < reportDeadline;

  const openTicket = booking.tickets.find((t) => t.id === openTicketId) ?? null;

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
        {booking.is_original_buyer && booking.status === "pending" && booking.manual_payment_instructions && (
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
                Vos billets seront confirmés et apparaîtront ici dès que l&apos;organisateur aura validé la réception du paiement.
              </p>
            </div>
          </div>
        )}

        {/* Paiement automatique — une fois CinetPay branché */}
        {booking.is_original_buyer && booking.status === "pending" && !booking.manual_payment_instructions && (
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

        {/* Infos événement + commande */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{formatFullDate(booking.event.starts_at)}</p>
          </div>
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {formatTime(booking.event.starts_at)} → {formatTime(booking.event.ends_at)}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{booking.event.venue_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{booking.event.city.name}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-gray-50 dark:bg-dark-700 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">◆ {booking.is_original_buyer ? "Commande" : "Billets détenus"}</p>
              <p className="font-bold text-gray-900 dark:text-gray-100 mt-0.5">{booking.tickets.length} billet{booking.tickets.length > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-gray-50 dark:bg-dark-700 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">◆ Montant</p>
              <p className="font-bold text-[#1A6B3A] mt-0.5">
                {booking.total_amount === 0 ? "Gratuit" : `${booking.total_amount.toLocaleString("fr-FR")} FCFA`}
              </p>
            </div>
          </div>
        </div>

        {/* Liste des billets que je détiens dans cette commande — repliés par défaut, on
            révèle la carte artistique + le QR au clic (voir TicketRevealModal). */}
        {booking.tickets.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              {booking.tickets.length > 1 ? `Mes billets (${booking.tickets.length})` : "Mon billet"}
            </p>
            <div className="space-y-2">
              {booking.tickets.map((t) => {
                const tCfg = TICKET_STATUS_CONFIG[t.status] ?? { label: t.status, color: "text-gray-600 bg-gray-50 border-gray-200" };
                return (
                  <button
                    key={t.id}
                    onClick={() => setOpenTicketId(t.id)}
                    className="w-full flex items-center justify-between bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-dark-700 active:scale-[0.99] transition-transform text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0F2E20] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-sm">🎟️</span>
                      </div>
                      <div>
                        <p className="font-jakarta font-bold text-sm text-gray-900 dark:text-gray-100">
                          {t.seat_number !== null
                            ? `${booking.ticket_type.name} · Place ${t.seat_number}`
                            : booking.quantity > 1 ? `Billet ${t.ticket_number}` : booking.ticket_type.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t.seat_number !== null
                            ? "Toucher pour voir le QR"
                            : booking.quantity > 1 ? booking.ticket_type.name : "Toucher pour voir le QR"}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-dm px-2 py-0.5 rounded-full border flex-shrink-0 ${tCfg.color}`}>
                      {tCfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
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

      {openTicket && (
        <TicketRevealModal
          ticket={openTicket}
          booking={booking}
          onClose={() => setOpenTicketId(null)}
          onChanged={invalidateAfterTicketChange}
        />
      )}
    </div>
  );
}

/* ============================================================
 * MODALE DE RÉVÉLATION D'UN BILLET
 * ============================================================ */

function TicketRevealModal({
  ticket, booking, onClose, onChanged,
}: {
  ticket: TicketRow;
  booking: EventBookingDetail;
  onClose: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const router = useRouter();
  const ticketCardRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferSent, setTransferSent] = useState(false);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelResult, setCancelResult] = useState<string | null>(null);

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<{ message: string }>(`/events/tickets/${ticket.id}/transfer`, { recipient_phone: transferPhone.trim() }),
    onSuccess: () => {
      onChanged();
      setTransferSent(true);
      setTimeout(() => router.push("/evenements/mes-billets"), 1800);
    },
    onError: (err) => {
      setTransferError(err instanceof ApiError ? err.message : "Erreur réseau.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.delete<{ message: string }>(`/events/tickets/${ticket.id}`),
    onSuccess: (res) => {
      onChanged();
      setCancelResult(res.message);
      setShowCancelConfirm(false);
    },
    onError: (err) => {
      setCancelError(err instanceof ApiError ? err.message : "Impossible d'annuler");
    },
  });

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSaveTicket(): Promise<void> {
    if (!ticketCardRef.current) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ticketCardRef.current, { useCORS: true, scale: 2, backgroundColor: "#0F2E20" });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Échec de la génération de l'image");

      const filename = `billet-vivre-${booking.event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${ticket.ticket_number}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      // La feuille de partage native échoue parfois pour des raisons hors de notre contrôle
      // (support fichier incohérent selon iOS/Android/PWA installée) même quand canShare()
      // avait répondu oui — sans repli, l'acheteur se retrouvait juste avec une erreur
      // générique et aucun moyen d'obtenir son image. Le fallback plain-download tente
      // toujours la sauvegarde, il ne fait qu'échouer moins souvent que le partage natif.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: booking.event.title });
          return;
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") return; // fermé volontairement
          // Le partage a échoué pour une autre raison — on retente en téléchargement simple
          // plutôt que d'abandonner.
        }
      }
      downloadBlob(blob, filename);
    } catch {
      setSaveError("Impossible d'enregistrer le billet. Réessayez, ou faites une capture d'écran de ce QR code.");
    } finally {
      setIsSaving(false);
    }
  }

  const canTransfer = ticket.status === "valid" && new Date(booking.event.starts_at) > new Date();
  const canCancel = ticket.status === "valid" && new Date(booking.event.starts_at) > new Date();
  const refund = refundStatus(ticket.created_at);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] px-4 py-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-xs mx-auto" onClick={(e) => e.stopPropagation()}>
        {/* Bouton fermer */}
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
            ✕
          </button>
        </div>

        {/* Billet artistique — vert VIVRE, seul le QR est en clair au centre. Volontairement
            centré et compact (max-w-xs) plutôt que plein écran : c'est un objet qu'on montre
            à quelqu'un, pas une page à faire défiler. */}
        <div ref={ticketCardRef} className="relative bg-gradient-to-br from-[#0F2E20] via-[#164A30] to-[#1A6B3A] rounded-[28px] pt-7 pb-5 px-6 shadow-2xl overflow-hidden">
          {/* Motif décoratif discret — même losange tricolore que la bande de pied de billet */}
          <div className="absolute inset-0 opacity-[0.08] brand-pattern" aria-hidden="true" />

          <div className="relative text-center mb-5">
            <VivreLogo size={16} variant="light" className="mx-auto mb-3" />
            <p className="text-white font-sora font-extrabold text-base leading-tight text-balance">
              {booking.event.title}
            </p>
            <p className="text-[#F5A623] text-[11px] mt-1.5 font-dm font-semibold uppercase tracking-wider">
              {booking.ticket_type.name}
              {booking.quantity > 1 && ` · Billet ${ticket.ticket_number}/${booking.quantity}`}
            </p>
            {ticket.seat_number !== null && (
              <p className="text-white font-sora font-extrabold text-2xl mt-2">
                Place {ticket.seat_number}
              </p>
            )}
            <p className="text-white/70 text-xs mt-1">
              {[booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || booking.user.phone}
            </p>
          </div>

          {/* Séparateur pointillé style ticket */}
          <div className="relative flex items-center mb-5">
            <div className="w-5 h-5 rounded-full bg-black/40 -ml-9" />
            <div className="flex-1 border-t-2 border-dashed border-white/20 mx-1" />
            <div className="w-5 h-5 rounded-full bg-black/40 -mr-9" />
          </div>

          {/* Panneau QR — seule zone claire du billet */}
          <div className="relative flex justify-center">
            <div className="relative bg-white rounded-2xl p-4 shadow-inner">
              <div className="absolute top-1/2 -left-[34px] -translate-y-1/2 w-6 h-6 rounded-full bg-[#0F2E20]" aria-hidden="true" />
              <div className="absolute top-1/2 -right-[34px] -translate-y-1/2 w-6 h-6 rounded-full bg-[#0F2E20]" aria-hidden="true" />
              {ticket.status === "cancelled" ? (
                <div className="relative opacity-30">
                  <QRCodeSVG value={ticket.qr_code} size={168} level="M" fgColor="#0F2E20" />
                </div>
              ) : (
                <QRCodeSVG value={ticket.qr_code} size={168} level="M" fgColor="#0F2E20" bgColor="#FFFFFF" />
              )}
            </div>
          </div>

          {ticket.status === "checked_in" && (
            <p className="relative text-center text-[#F5A623] text-xs font-bold mt-4">✓ BILLET UTILISÉ</p>
          )}
          {ticket.status === "cancelled" && (
            <p className="relative text-center text-red-300 text-xs font-bold mt-4">BILLET ANNULÉ</p>
          )}
          {ticket.status === "valid" && (
            <p className="relative text-center text-white/40 text-[10px] mt-4">
              Présentez ce QR code à l&apos;entrée
            </p>
          )}

          <div className="brand-pattern h-2.5 -mx-6 mt-5 relative" />
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-2">
          {ticket.status !== "cancelled" && (
            <>
              <button
                onClick={() => void handleSaveTicket()}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 text-white font-semibold rounded-2xl disabled:opacity-60 active:scale-95 transition-all"
              >
                {isSaving ? "Génération…" : "Enregistrer le billet"}
              </button>
              <p className="text-center text-white/40 text-[11px] -mt-1">
                Sauvegarde ce billet en image sur votre téléphone — utile sans connexion à l&apos;entrée
              </p>
            </>
          )}
          {saveError && <p className="text-xs text-red-300 text-center">{saveError}</p>}

          {canTransfer && !transferSent && !showTransferForm && (
            <button
              onClick={() => setShowTransferForm(true)}
              className="w-full py-3 border-2 border-white/20 text-white font-semibold rounded-2xl"
            >
              Transférer ce billet
            </button>
          )}

          {showTransferForm && (
            <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transférer à qui ?</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ce billet précis passera immédiatement au numéro indiqué — vous n&apos;y aurez plus accès.
                La personne le retrouvera dans « Mes billets » en se connectant avec ce numéro sur VIVRE.
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

          {canCancel && !cancelResult && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full py-3 text-red-300 font-semibold text-sm"
            >
              Annuler ce billet
            </button>
          )}

          {cancelResult && (
            <div className="bg-white/10 rounded-2xl p-4 text-sm text-white text-center">{cancelResult}</div>
          )}
        </div>
      </div>

      {/* Modal confirmation annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-[70]" onClick={() => setShowCancelConfirm(false)}>
          <div className="w-full max-w-xs mx-auto bg-white dark:bg-dark-800 rounded-t-3xl px-4 py-6 pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Annuler ce billet ?</h2>
            <p className={`text-sm mb-4 ${refund.eligible ? "text-green-700" : "text-gray-500 dark:text-gray-400"}`}>
              {refund.eligible
                ? `${refund.label} — remboursement automatique de ${ticket.price_fcfa_at_purchase.toLocaleString("fr-FR")} FCFA.`
                : refund.label}
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
