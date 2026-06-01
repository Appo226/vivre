"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/hebergement/[id]/reservations — Gestion des réservations
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface PropertyBooking {
  id: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_amount: number;
  status: string;
  special_requests: string | null;
  created_at: string;
  user: { first_name: string; last_name: string; phone: string };
  room_type: { name: string; bed_type: string };
}

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  pending:    { label: "En attente",     dot: "bg-yellow-400" },
  confirmed:  { label: "Confirmée",      dot: "bg-green-500" },
  checked_in: { label: "Check-in",       dot: "bg-blue-500" },
  completed:  { label: "Terminée",       dot: "bg-gray-400" },
  cancelled:  { label: "Annulée",        dot: "bg-red-400" },
};

const NEXT_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  pending:    [{ label: "Confirmer", next: "confirmed", color: "bg-green-600 text-white" }, { label: "Refuser", next: "cancelled", color: "bg-red-50 text-red-600 border border-red-200" }],
  confirmed:  [{ label: "Check-in", next: "checked_in", color: "bg-blue-600 text-white" }, { label: "Annuler", next: "cancelled", color: "bg-red-50 text-red-600 border border-red-200" }],
  checked_in: [{ label: "Check-out", next: "completed", color: "bg-gray-700 text-white" }],
};

const TABS = [
  { key: "",           label: "Toutes" },
  { key: "pending",    label: "En attente" },
  { key: "confirmed",  label: "Confirmées" },
  { key: "checked_in", label: "En séjour" },
  { key: "completed",  label: "Terminées" },
];

export default function PropertyReservationsPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [bookings, setBookings] = useState<PropertyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) { router.push("/auth"); return; }
    setLoading(true);
    try {
      const url = `/properties/${params.id}/bookings${tab ? `?status=${tab}` : ""}`;
      const res = await apiClient.get<{ bookings: PropertyBooking[] }>(url);
      setBookings(res.bookings);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [params.id, tab, accessToken, router]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(bookingId: string, status: string): Promise<void> {
    setUpdating(bookingId);
    try {
      await apiClient.patch(`/property-bookings/${bookingId}/status`, { status });
      await load();
    } catch { /* ignore */ } finally { setUpdating(null); }
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-3">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Réservations</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-sm font-dm transition-colors",
                tab === t.key ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {loading && [1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}

        {!loading && bookings.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🏨</p>
            <p className="text-gray-500 font-dm text-sm">Aucune réservation dans cette catégorie.</p>
          </div>
        )}

        {bookings.map((b) => {
          const statusCfg = STATUS_LABELS[b.status] ?? { label: b.status, dot: "bg-gray-400" };
          const actions = NEXT_ACTIONS[b.status] ?? [];
          return (
            <div key={b.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                  <span className="text-sm font-jakarta font-semibold text-gray-900">{statusCfg.label}</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{b.total_amount.toLocaleString()} FCFA</p>
              </div>

              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-dm text-gray-700 font-semibold">
                    {b.user.first_name} {b.user.last_name}
                  </p>
                  <a href={`tel:${b.user.phone}`} className="text-xs text-green-700 font-dm underline">
                    {b.user.phone}
                  </a>
                </div>
                <p className="text-xs text-gray-500 font-dm">
                  {b.room_type.name} · {b.room_type.bed_type}
                </p>
                <p className="text-xs text-gray-600 font-dm">
                  📅 {b.check_in_date} → {b.check_out_date}
                  <span className="text-gray-400"> ({b.nights_count} nuit{b.nights_count !== 1 ? "s" : ""}, {b.guests_count} pers.)</span>
                </p>
                {b.special_requests && (
                  <p className="text-xs text-orange-600 font-dm">💬 {b.special_requests}</p>
                )}
              </div>

              {actions.length > 0 && (
                <div className="px-4 pb-3 flex gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.next}
                      onClick={() => void updateStatus(b.id, action.next)}
                      disabled={updating === b.id}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-jakarta font-semibold disabled:opacity-50 active:scale-95 transition-all ${action.color}`}
                    >
                      {updating === b.id ? "…" : action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
