"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/restaurant/[id]/commandes — File d'attente des commandes
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface OrderItem {
  quantity: number;
  unit_price: number;
  notes: string | null;
  menu_item: { name: string };
}

interface RestaurantOrder {
  id: string;
  order_type: string;
  status: string;
  total_amount: number;
  delivery_address: string | null;
  special_instructions: string | null;
  created_at: string;
  user: { first_name: string; last_name: string; phone: string };
  items: OrderItem[];
}

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  pending:   [{ label: "Accepter", next: "confirmed", color: "bg-green-600 text-white" }, { label: "Refuser", next: "cancelled", color: "bg-red-50 text-red-600 border border-red-200" }],
  confirmed: [{ label: "En préparation", next: "preparing", color: "bg-blue-600 text-white" }],
  preparing: [{ label: "Prête", next: "ready", color: "bg-orange-500 text-white" }],
  ready:     [],
  picked_up: [],
  delivered: [],
  cancelled: [],
};

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  pending:   { label: "Nouvelle",       dot: "bg-yellow-400" },
  confirmed: { label: "Confirmée",      dot: "bg-green-500" },
  preparing: { label: "En préparation", dot: "bg-blue-500" },
  ready:     { label: "Prête",          dot: "bg-orange-500" },
  picked_up: { label: "En livraison",   dot: "bg-indigo-500" },
  delivered: { label: "Livrée",         dot: "bg-gray-400" },
  cancelled: { label: "Annulée",        dot: "bg-red-400" },
};

const TABS = [
  { key: "",          label: "Toutes" },
  { key: "pending",   label: "Nouvelles" },
  { key: "confirmed", label: "Confirmées" },
  { key: "preparing", label: "En cours" },
  { key: "ready",     label: "Prêtes" },
  { key: "delivered", label: "Livrées" },
];

export default function RestaurantCommandesPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement | null {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useEffect(() => { if (!accessToken) { router.push("/auth"); } }, [accessToken, router]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const url = `/restaurants/${params.id}/orders${tab ? `?status=${tab}` : ""}`;
      const res = await apiClient.get<{ orders: RestaurantOrder[] }>(url);
      setOrders(res.orders);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [params.id, tab, accessToken, router]);

  useEffect(() => { void load(); }, [load]);

  /* Auto-refresh toutes les 30s pour les commandes actives */
  useEffect(() => {
    if (tab === "delivered" || tab === "cancelled") return;
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load, tab]);

  async function updateStatus(orderId: string, status: string): Promise<void> {
    setUpdating(orderId);
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status });
      await load();
    } catch { /* ignore */ } finally { setUpdating(null); }
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4 mb-3">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Commandes</h1>
          <button onClick={() => void load()} className="ml-auto text-sm text-green-700 font-dm">
            ↻ Actualiser
          </button>
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

        {!loading && orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-dm text-sm">Aucune commande dans cette catégorie.</p>
          </div>
        )}

        {orders.map((order) => {
          const statusCfg = STATUS_LABELS[order.status] ?? { label: order.status, dot: "bg-gray-400" };
          const actions = STATUS_ACTIONS[order.status] ?? [];
          const orderTime = new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                  <span className="text-sm font-jakarta font-semibold text-gray-900">{statusCfg.label}</span>
                  <span className="text-xs text-gray-400 font-dm">· {orderTime}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{order.total_amount.toLocaleString()} FCFA</p>
                  <p className="text-xs text-gray-400 font-dm">
                    {order.order_type === "delivery" ? "🛵 Livraison" : "🏃 À emporter"}
                  </p>
                </div>
              </div>

              {/* Client */}
              <div className="px-4 py-2 flex items-center justify-between">
                <p className="text-sm font-dm text-gray-700">
                  {order.user.first_name} {order.user.last_name}
                </p>
                <a href={`tel:${order.user.phone}`} className="text-xs text-green-700 font-dm underline">
                  {order.user.phone}
                </a>
              </div>

              {/* Articles */}
              <div className="px-4 pb-2 space-y-0.5">
                {order.items.map((item, i) => (
                  <p key={i} className="text-xs text-gray-600 font-dm">
                    × {item.quantity} {item.menu_item.name}
                    {item.notes ? <span className="text-gray-400"> ({item.notes})</span> : null}
                  </p>
                ))}
                {order.special_instructions && (
                  <p className="text-xs text-orange-600 font-dm mt-1">💬 {order.special_instructions}</p>
                )}
                {order.delivery_address && (
                  <p className="text-xs text-gray-400 font-dm">📍 {order.delivery_address}</p>
                )}
              </div>

              {/* Actions */}
              {actions.length > 0 && (
                <div className="px-4 pb-3 flex gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.next}
                      onClick={() => void updateStatus(order.id, action.next)}
                      disabled={updating === order.id}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-jakarta font-semibold disabled:opacity-50 active:scale-95 transition-all ${action.color}`}
                    >
                      {updating === order.id ? "…" : action.label}
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
