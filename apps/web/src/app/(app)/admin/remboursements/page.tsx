"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/remboursements — Traitement des remboursements Mobile Money
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface Refund {
  id: string;
  amount: number;
  status: string;
  refund_method: string;
  booking_type: string | null;
  booking_id: string | null;
  reason: string | null;
  user_id: string;
  payment_method: string;
  created_at: string;
  processed_at: string | null;
}

const BOOKING_TYPE_LABELS: Record<string, string> = {
  transport: "🚌 Bus",
  property:  "🏨 Hôtel",
  food:      "🍽️ Repas",
  event:     "🎟️ Événement",
};

export default function AdminRemboursementsPage(): React.ReactElement | null {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useEffect(() => { if (!accessToken) { router.push("/auth"); } }, [accessToken, router]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "completed" | "rejected">("pending");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<Refund[]>(
        `/admin/refunds?status=${tab}&method=mobile_money`
      );
      setRefunds(res);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [tab, accessToken, router]);

  useEffect(() => { void load(); }, [load]);

  async function processRefund(id: string, action: "approve" | "reject"): Promise<void> {
    setActing(id);
    try {
      await apiClient.post(`/admin/refunds/${id}/process`, { action });
      setRefunds((prev) => prev.filter((r) => r.id !== id));
    } catch { /* ignore */ } finally { setActing(null); }
  }

  const TABS = [
    { key: "pending" as const,   label: "En attente" },
    { key: "completed" as const, label: "Traités" },
    { key: "rejected" as const,  label: "Rejetés" },
  ];

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-3">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Remboursements</h1>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "flex-1 py-1.5 rounded-full text-sm font-dm transition-colors",
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
            <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
            <div className="h-8 bg-gray-200 rounded-xl" />
          </div>
        ))}

        {!loading && refunds.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-gray-500 font-dm text-sm">
              {tab === "pending" ? "Aucun remboursement en attente." : "Aucun remboursement dans cette catégorie."}
            </p>
          </div>
        )}

        {refunds.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-jakarta font-bold text-gray-900">
                  {r.amount.toLocaleString()} FCFA
                </p>
                <p className="text-xs text-gray-500 font-dm">
                  {BOOKING_TYPE_LABELS[r.booking_type ?? ""] ?? r.booking_type ?? "—"} · via {r.payment_method}
                </p>
              </div>
              <p className="text-xs text-gray-400 font-dm shrink-0 ml-2">
                {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </p>
            </div>
            {r.reason && (
              <p className="text-xs text-gray-600 font-dm">💬 {r.reason}</p>
            )}
            <p className="text-xs text-gray-400 font-dm font-mono">
              ID: {r.booking_id?.slice(0, 8)}…
            </p>

            {tab === "pending" && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void processRefund(r.id, "reject")}
                  disabled={acting === r.id}
                  className="flex-1 border border-red-200 text-red-600 font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  Rejeter
                </button>
                <button
                  onClick={() => void processRefund(r.id, "approve")}
                  disabled={acting === r.id}
                  className="flex-1 bg-green-600 text-white font-jakarta font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
                >
                  {acting === r.id ? "…" : "✅ Approuver"}
                </button>
              </div>
            )}

            {tab === "completed" && r.processed_at && (
              <p className="text-xs text-green-600 font-dm">
                ✓ Traité le {new Date(r.processed_at).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
