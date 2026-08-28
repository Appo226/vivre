"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements/[id]/reservations — Réservations d'un événement (organisateur).
 *
 * Pendant la phase pilote sans CinetPay, les billets payants restent "en attente" jusqu'à
 * ce que l'organisateur confirme ici avoir reçu le mobile money manuellement de l'acheteur.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface Booking {
  id: string;
  quantity: number;
  total_amount: number;
  status: string;
  created_at: string;
  checked_in_at: string | null;
  ticket_type: { name: string };
  user: { first_name: string | null; last_name: string | null; phone: string };
  payment: { payment_method: string; provider_ref: string | null } | null;
}

interface StaffAccess {
  id: string;
  phone: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente de paiement", color: "text-amber-700 bg-amber-50 border-amber-200" },
  confirmed: { label: "Confirmé", color: "text-green-700 bg-green-50 border-green-200" },
  checked_in: { label: "Entré", color: "text-gray-600 bg-gray-50 border-gray-200" },
  cancelled: { label: "Annulé", color: "text-red-700 bg-red-50 border-red-200" },
};

function formatCheckInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function ReservationsPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, hasHydrated } = useAuthStore();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [managePanel, setManagePanel] = useState<"none" | "cancel" | "reschedule">("none");
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSuccess, setManageSuccess] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState(false);

  const [showStaffPanel, setShowStaffPanel] = useState(false);
  const [staff, setStaff] = useState<StaffAccess[]>([]);
  const [staffPhone, setStaffPhone] = useState("");
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);

  const loadStaff = useCallback(() => {
    apiClient
      .get<{ staff: StaffAccess[] }>(`/events/${id}/staff`)
      .then((r) => setStaff(r.staff))
      .catch(() => {});
  }, [id]);

  async function addStaff(): Promise<void> {
    if (staffPhone.trim().length < 6) { setStaffError("Numéro invalide."); return; }
    setStaffBusy(true); setStaffError(null);
    try {
      await apiClient.post(`/events/${id}/staff`, { phone: staffPhone.trim() });
      setStaffPhone("");
      loadStaff();
    } catch (err) {
      setStaffError(err instanceof ApiError ? err.message : "Échec de l'ajout.");
    } finally { setStaffBusy(false); }
  }

  async function removeStaff(staffId: string): Promise<void> {
    try {
      await apiClient.delete(`/events/${id}/staff/${staffId}`);
      loadStaff();
    } catch { /* silencieux — la liste ne bougera pas, l'utilisateur peut réessayer */ }
  }

  async function submitCancel(): Promise<void> {
    if (cancelReason.trim().length < 10) { setManageError("Motif requis (min. 10 caractères)."); return; }
    setManageBusy(true); setManageError(null);
    try {
      const res = await apiClient.patch<{ message: string }>(`/events/${id}/cancel`, { reason: cancelReason.trim() });
      setManageSuccess(res.message);
      setManagePanel("none");
    } catch (err) {
      setManageError(err instanceof ApiError ? err.message : "Échec de l'annulation.");
    } finally { setManageBusy(false); }
  }

  async function submitReschedule(): Promise<void> {
    if (!newStartsAt || !newEndsAt) { setManageError("Renseignez les nouvelles dates."); return; }
    if (rescheduleReason.trim().length < 10) { setManageError("Motif requis (min. 10 caractères)."); return; }
    setManageBusy(true); setManageError(null);
    try {
      const res = await apiClient.patch<{ message: string }>(`/events/${id}/reschedule`, {
        starts_at: new Date(newStartsAt).toISOString(),
        ends_at: new Date(newEndsAt).toISOString(),
        reason: rescheduleReason.trim(),
      });
      setManageSuccess(res.message);
      setManagePanel("none");
    } catch (err) {
      setManageError(err instanceof ApiError ? err.message : "Échec de la reprogrammation.");
    } finally { setManageBusy(false); }
  }

  const load = useCallback(() => {
    apiClient
      .get<{ bookings: Booking[] }>(`/events/${id}/bookings`)
      .then((r) => setBookings(r.bookings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) { router.push("/auth"); return; }
    load();
    loadStaff();
  }, [hasHydrated, accessToken, router, load, loadStaff]);

  async function confirmPayment(bookingId: string): Promise<void> {
    if (note.trim().length < 3) {
      setError("Ajoutez une référence de transaction (min. 3 caractères).");
      return;
    }
    setError(null);
    try {
      await apiClient.patch(`/events/bookings/${bookingId}/confirm-payment`, { reference_note: note.trim() });
      setConfirmingId(null);
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de la confirmation.");
    }
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-16">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Réservations</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {/* Gestion de l'événement — annulation / reprogrammation */}
        {managePanel === "none" && (
          <div className="flex gap-2">
            <button
              onClick={() => { setManagePanel("reschedule"); setManageError(null); }}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-jakarta font-semibold"
            >
              Reprogrammer
            </button>
            <button
              onClick={() => { setManagePanel("cancel"); setManageError(null); }}
              className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-jakarta font-semibold"
            >
              Annuler l&apos;événement
            </button>
          </div>
        )}

        {manageSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            {manageSuccess}
          </div>
        )}

        {/* Staff — accès scan délégué */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setShowStaffPanel((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="text-left">
              <p className="font-jakarta font-semibold text-gray-900 text-sm">Staff — accès scan</p>
              <p className="text-xs text-gray-500 font-dm">
                {staff.length === 0 ? "Personne d'autre ne peut scanner" : `${staff.length} numéro${staff.length > 1 ? "s" : ""} autorisé${staff.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showStaffPanel ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showStaffPanel && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
              <p className="text-xs text-gray-500 font-dm">
                Un numéro ajouté ici peut scanner les billets de CET événement en se connectant
                normalement (OTP) — sans avoir votre compte. Il n&apos;a accès à rien d&apos;autre.
              </p>

              {staff.length > 0 && (
                <div className="space-y-2">
                  {staff.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700 font-dm">{s.phone}</span>
                      <button
                        onClick={() => void removeStaff(s.id)}
                        className="text-xs text-red-500 font-dm"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="tel"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder="+226 XX XX XX XX"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => void addStaff()}
                  disabled={staffBusy}
                  className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                >
                  {staffBusy ? "…" : "Ajouter"}
                </button>
              </div>
              {staffError && <p className="text-xs text-red-600">{staffError}</p>}
            </div>
          )}
        </div>

        {managePanel === "cancel" && (
          <div className="bg-white rounded-xl border border-red-200 p-4 space-y-3">
            <p className="font-jakarta font-semibold text-gray-900 text-sm">Annuler cet événement</p>
            <p className="text-xs text-gray-500">
              Toutes les réservations actives seront annulées et les acheteurs ayant payé seront
              automatiquement mis en file de remboursement.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif de l'annulation (min. 10 caractères)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-20"
            />
            {manageError && <p className="text-xs text-red-600">{manageError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setManagePanel("none")} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Retour
              </button>
              <button
                onClick={() => void submitCancel()}
                disabled={manageBusy}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {manageBusy ? "…" : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        )}

        {managePanel === "reschedule" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="font-jakarta font-semibold text-gray-900 text-sm">Reprogrammer cet événement</p>
            <p className="text-xs text-gray-500">
              Les acheteurs déjà inscrits pourront annuler librement, même à moins de 24h de la
              nouvelle date.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" value={newStartsAt} onChange={(e) => setNewStartsAt(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm" />
              <input type="datetime-local" value={newEndsAt} onChange={(e) => setNewEndsAt(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <textarea
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Motif de la reprogrammation (min. 10 caractères)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-20"
            />
            {manageError && <p className="text-xs text-red-600">{manageError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setManagePanel("none")} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Retour
              </button>
              <button
                onClick={() => void submitReschedule()}
                disabled={manageBusy}
                className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {manageBusy ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-gray-400 text-center py-8">Chargement…</p>}

        {!loading && bookings.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Aucune réservation pour l&apos;instant.</p>
        )}

        {/* Tableau de bord des entrées — billets scannés vs total valide, mis à jour à
            chaque rechargement de cette page (pas juste le compteur de session du scanner,
            qui repart à zéro à chaque ouverture de la page scanner). */}
        {!loading && bookings.length > 0 && (() => {
          const validBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "checked_in");
          const totalQty = validBookings.reduce((sum, b) => sum + b.quantity, 0);
          const checkedInQty = validBookings
            .filter((b) => b.status === "checked_in")
            .reduce((sum, b) => sum + b.quantity, 0);
          if (totalQty === 0) return null;
          const pct = Math.round((checkedInQty / totalQty) * 100);
          return (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-jakarta font-semibold text-gray-900 text-sm">Entrées scannées</p>
                <p className="text-xs text-gray-500 font-dm">{pct}%</p>
              </div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-2xl font-sora font-extrabold text-gray-900">{checkedInQty}</span>
                <span className="text-sm text-gray-400 font-dm">/ {totalQty} billets</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-700 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}

        {bookings.map((b) => {
          const statusCfg = STATUS_LABELS[b.status] ?? { label: b.status, color: "text-gray-600 bg-gray-50 border-gray-200" };
          const buyerName = [b.user.first_name, b.user.last_name].filter(Boolean).join(" ") || b.user.phone;

          return (
            <div key={b.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-jakarta font-semibold text-gray-900 text-sm">{buyerName}</p>
                  <p className="text-xs text-gray-500 font-dm">{b.user.phone}</p>
                </div>
                <span className={`text-xs font-dm px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-xs text-gray-600 font-dm">
                {b.quantity} × {b.ticket_type.name} — {b.total_amount.toLocaleString("fr-FR")} FCFA
              </p>
              {b.status === "checked_in" && b.checked_in_at && (
                <p className="text-xs text-gray-400 font-dm">Scanné à {formatCheckInTime(b.checked_in_at)}</p>
              )}
              {b.payment?.payment_method === "manual_mobile_money" && b.payment.provider_ref && (
                <p className="text-xs text-gray-400 font-dm">Réf. paiement : {b.payment.provider_ref}</p>
              )}

              {b.status === "pending" && b.total_amount > 0 && (
                confirmingId === b.id ? (
                  <div className="space-y-2 pt-2">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Référence de la transaction reçue (ex : OM-88213)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmingId(null); setError(null); }}
                        className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => void confirmPayment(b.id)}
                        className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold"
                      >
                        Confirmer reçu
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setConfirmingId(b.id); setNote(""); setError(null); }}
                    className="w-full py-2 border-2 border-green-200 text-green-700 rounded-lg text-sm font-semibold mt-1"
                  >
                    J&apos;ai reçu ce paiement
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
