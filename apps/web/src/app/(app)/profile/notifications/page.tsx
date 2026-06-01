"use client";

export const dynamic = "force-dynamic";

/**
 * /profile/notifications — Centre de notifications VIVRE
 *
 * Affiche l'historique des notifications in-app avec pagination infinie.
 * Marque tout comme lu à l'ouverture.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface NotifItem {
  id:       string;
  type:     string;
  title:    string;
  body:     string;
  is_read:  boolean;
  sent_at:  string;
  data:     Record<string, string> | null;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

const TYPE_ICONS: Record<string, string> = {
  ride_status:       "🛵",
  order_status:      "🍽️",
  booking_status:    "🏨",
  payment_confirmed: "✅",
  booking_cancelled: "❌",
  refund:            "💰",
  system:            "📢",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `Il y a ${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function NotificationsPage(): React.ReactElement | null {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useEffect(() => { if (!accessToken) { router.push("/auth"); } }, [accessToken, router]);

  const [notifs,     setNotifs]     = useState<NotifItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (!accessToken) return;
    const params = cursor ? `?cursor=${cursor}` : "";
    const res = await apiClient.get<{
      notifications: NotifItem[];
      next_cursor: string | null;
    }>(`/notifications${params}`);
    setNotifs((prev) => cursor ? [...prev, ...res.notifications] : res.notifications);
    setNextCursor(res.next_cursor);
  }, [accessToken, router]);

  useEffect(() => {
    void load()
      .finally(() => setLoading(false));

    /* Marquer tout comme lu à l'ouverture */
    void apiClient.patch("/notifications/read-all", {}).catch(() => {});
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await load(nextCursor).finally(() => setLoadingMore(false));
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500 text-xl">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Notifications</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-2">
        {loading && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && notifs.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔔</p>
            <p className="text-gray-400 font-dm text-sm">Aucune notification pour le moment.</p>
          </div>
        )}

        {notifs.map((n) => (
          <div
            key={n.id}
            className={[
              "bg-white rounded-xl p-4 flex gap-3 border transition-colors",
              n.is_read ? "border-gray-100" : "border-green-200 bg-green-50/30",
            ].join(" ")}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xl">
              {TYPE_ICONS[n.type] ?? "🔔"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 font-jakarta">{n.title}</p>
              <p className="text-xs text-gray-500 font-dm mt-0.5 leading-relaxed">{n.body}</p>
              <p className="text-xs text-gray-400 font-dm mt-1">{relativeTime(n.sent_at)}</p>
            </div>
            {!n.is_read && (
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />
            )}
          </div>
        ))}

        {nextCursor && !loading && (
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="w-full py-3 text-sm text-green-700 font-jakarta font-semibold disabled:opacity-50"
          >
            {loadingMore ? "Chargement…" : "Voir plus"}
          </button>
        )}
      </div>
    </div>
  );
}
