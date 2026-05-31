"use client";

/**
 * reservations/page.tsx — Gestion des réservations hébergement
 *
 * Vue des réservations de l'hôtel / maison d'hôtes :
 *   pending    → confirmer ou refuser
 *   confirmed  → marquer "client arrivé" (checked_in)
 *   checked_in → marquer "client parti" (completed)
 *   completed  → terminée
 *   cancelled  → annulée
 *
 * Filtres par onglets : À traiter / En cours / Historique
 * Rafraîchissement auto toutes les 30s sur les onglets actifs.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Booking {
  id:              string;
  status:          string;
  check_in_date:   string;
  check_out_date:  string;
  nights_count:    number;
  guests_count:    number;
  total_amount:    number;
  special_requests: string | null;
  created_at:      string;
  user: {
    first_name: string | null;
    last_name:  string | null;
    phone:      string;
  } | null;
  room_type: {
    name:     string;
    bed_type: string;
  } | null;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const TABS = [
  {
    key:      "pending",
    label:    "À traiter",
    statuses: ["pending"],
    refresh:  true,
  },
  {
    key:      "active",
    label:    "En cours",
    statuses: ["confirmed", "checked_in"],
    refresh:  true,
  },
  {
    key:      "history",
    label:    "Historique",
    statuses: ["completed", "cancelled"],
    refresh:  false,
  },
];

const STATUS_CONFIG: Record<string, {
  label: string; color: string;
  nextAction?: string; nextLabel?: string;
  refuseAction?: string;
}> = {
  pending:    { label: "En attente",   color: "bg-orange-100 text-orange-700", nextAction: "confirmed",  nextLabel: "✓ Confirmer",  refuseAction: "cancelled" },
  confirmed:  { label: "Confirmée",    color: "bg-blue-100 text-blue-700",    nextAction: "checked_in", nextLabel: "🏨 Check-in" },
  checked_in: { label: "Client présent", color: "bg-green-100 text-green-700",  nextAction: "completed",  nextLabel: "✅ Check-out" },
  completed:  { label: "Terminée ✓",  color: "bg-gray-100 text-gray-500" },
  cancelled:  { label: "Annulée",      color: "bg-red-100 text-red-600" },
};

/* ============================================================
 * COMPOSANT CARTE RÉSERVATION
 * ============================================================ */

function BookingCard({
  booking,
  onStatusChange,
  updating,
}: {
  booking:        Booking;
  onStatusChange: (id: string, status: string) => Promise<void>;
  updating:       boolean;
}) {
  const cfg = STATUS_CONFIG[booking.status] ?? { label: booking.status, color: "bg-gray-100 text-gray-600" };

  const customerName = booking.user
    ? [booking.user.first_name, booking.user.last_name].filter(Boolean).join(" ") || booking.user.phone
    : "Client inconnu";

  const checkin  = new Date(booking.check_in_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const checkout = new Date(booking.check_out_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* En-tête */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="font-bold text-gray-900 text-sm">
            {customerName}
            {booking.user?.phone && booking.user.phone !== customerName && (
              <span className="font-normal text-gray-400 ml-1">· {booking.user.phone}</span>
            )}
          </p>
          <p className="text-xs text-gray-400 font-mono">{booking.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {/* Infos séjour */}
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Chambre</p>
            <p className="font-medium text-gray-900">
              {booking.room_type?.name ?? "—"}
              {booking.room_type?.bed_type && (
                <span className="text-gray-400 font-normal ml-1">({booking.room_type.bed_type})</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Séjour</p>
            <p className="font-medium text-gray-900">
              {checkin} → {checkout}
              <span className="text-gray-400 font-normal ml-1">
                ({booking.nights_count} nuit{booking.nights_count > 1 ? "s" : ""})
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Voyageurs</p>
            <p className="font-medium text-gray-900">{booking.guests_count} pers.</p>
          </div>
        </div>
        {booking.special_requests && (
          <p className="mt-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5 italic">
            📝 {booking.special_requests}
          </p>
        )}
      </div>

      {/* Pied — montant + actions */}
      <div className="px-5 py-3 flex items-center justify-between gap-4">
        <p className="font-bold text-gray-900">{booking.total_amount.toLocaleString()} FCFA</p>
        <div className="flex gap-2">
          {cfg.refuseAction && (
            <button
              onClick={() => void onStatusChange(booking.id, cfg.refuseAction!)}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Refuser
            </button>
          )}
          {cfg.nextAction && (
            <button
              onClick={() => void onStatusChange(booking.id, cfg.nextAction!)}
              disabled={updating}
              className="px-4 py-1.5 text-xs font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {updating ? "…" : cfg.nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function ReservationsPage() {
  const { user, accessToken } = useAuthStore();
  const propertyId = user?.propertyId;

  const [activeTab, setActiveTab]   = useState("pending");
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  /* --------------------------------------------------------
   * Charger les réservations
   * -------------------------------------------------------- */
  const loadBookings = useCallback(async () => {
    if (!accessToken || !propertyId) { setLoading(false); return; }

    const tab = TABS.find((t) => t.key === activeTab)!;

    try {
      /* On effectue une requête par statut et on fusionne les résultats */
      const results = await Promise.all(
        tab.statuses.map((s) =>
          apiClient.get<{ bookings: Booking[] }>(
            `/properties/${propertyId}/bookings?status=${s}&limit=50`
          )
        )
      );

      const all = results.flatMap((r) => r.bookings ?? []);
      /* Tri par date de création décroissante */
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setBookings(all);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, propertyId, activeTab]);

  useEffect(() => {
    setLoading(true);
    void loadBookings();

    const tab = TABS.find((t) => t.key === activeTab)!;
    if (tab.refresh) {
      const t = setInterval(() => void loadBookings(), 30_000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [loadBookings, activeTab]);

  /* --------------------------------------------------------
   * Changer le statut d'une réservation
   * -------------------------------------------------------- */
  async function handleStatusChange(bookingId: string, status: string) {
    setUpdatingId(bookingId);
    try {
      await apiClient.patch(`/property-bookings/${bookingId}/status`, { status });
      /* Si la réservation sort de l'onglet courant, la retirer */
      const tab = TABS.find((t) => t.key === activeTab)!;
      if (!tab.statuses.includes(status)) {
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      } else {
        setBookings((prev) =>
          prev.map((b) => b.id === bookingId ? { ...b, status } : b)
        );
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  /* ============================================================
   * RENDER
   * ============================================================ */
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Réservations</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-40 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">
            {activeTab === "pending" ? "✅" : activeTab === "active" ? "🏨" : "📭"}
          </p>
          <p className="text-gray-500">
            {activeTab === "pending"
              ? "Aucune réservation en attente"
              : activeTab === "active"
              ? "Aucun séjour en cours"
              : "Aucun historique"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onStatusChange={handleStatusChange}
              updating={updatingId === booking.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
