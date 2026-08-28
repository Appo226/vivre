"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements/[id]/analytics — Tableau de bord analytics (organisateur)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface Analytics {
  views: number;
  bookings_count: number;
  tickets_sold: number;
  tickets_cancelled: number;
  total_capacity: number;
  sold_percent: number;
  checked_in: number;
  checked_in_percent: number;
  view_to_booking_percent: number;
  gross_revenue_fcfa: number;
  commission_fcfa: number;
  net_revenue_fcfa: number;
  sales_by_ticket_type: { ticket_type_id: string; name: string; price_fcfa: number; capacity: number; sold: number; revenue_fcfa: number }[];
  sales_by_day: { date: string; bookings: number; tickets: number; revenue_fcfa: number }[];
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }): React.ReactElement {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className="text-xs text-gray-500 font-dm">{label}</p>
      <p className={`text-lg font-sora font-bold mt-0.5 ${accent ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function AnalyticsPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, hasHydrated } = useAuthStore();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiClient
      .get<Analytics>(`/events/${id}/analytics`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) { router.push("/auth"); return; }
    load();
  }, [hasHydrated, accessToken, router, load]);

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-16">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Analytics</h1>
        </div>
      </header>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Chargement…</p>}

      {!loading && data && (
        <div className="px-4 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Revenu brut" value={`${fmt(data.gross_revenue_fcfa)} FCFA`} accent="text-green-700" />
            <StatTile label="Revenu net (après frais)" value={`${fmt(data.net_revenue_fcfa)} FCFA`} accent="text-green-700" />
            <StatTile label="Billets vendus" value={`${data.tickets_sold} / ${data.total_capacity}`} />
            <StatTile label="Taux de remplissage" value={`${data.sold_percent}%`} />
            <StatTile label="Entrées validées" value={`${data.checked_in} (${data.checked_in_percent}%)`} />
            <StatTile label="Annulations" value={String(data.tickets_cancelled)} />
            <StatTile label="Vues de la page" value={fmt(data.views)} />
            <StatTile label="Taux de conversion" value={`${data.view_to_booking_percent}%`} />
          </div>

          {data.sales_by_ticket_type.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="font-jakarta font-semibold text-gray-900 text-sm mb-3">Ventes par type de billet</p>
              <div className="space-y-3">
                {data.sales_by_ticket_type.map((tt) => {
                  const pct = tt.capacity > 0 ? Math.min(100, Math.round((tt.sold / tt.capacity) * 100)) : 0;
                  return (
                    <div key={tt.ticket_type_id}>
                      <div className="flex justify-between text-xs font-dm text-gray-600 mb-1">
                        <span>{tt.name} ({tt.price_fcfa.toLocaleString("fr-FR")} FCFA)</span>
                        <span>{tt.sold}/{tt.capacity} · {fmt(tt.revenue_fcfa)} FCFA</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.sales_by_day.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="font-jakarta font-semibold text-gray-900 text-sm mb-3">Ventes par jour</p>
              <div className="space-y-2">
                {data.sales_by_day.map((d) => (
                  <div key={d.date} className="flex justify-between text-xs font-dm text-gray-600">
                    <span>{new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                    <span>{d.tickets} billet{d.tickets > 1 ? "s" : ""} · {fmt(d.revenue_fcfa)} FCFA</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
