"use client";

/**
 * commandes/page.tsx — Gestion des commandes restaurant
 *
 * Vue temps réel de toutes les commandes :
 *   pending    → bouton "Confirmer" (restaurant accepte)
 *   confirmed  → bouton "En préparation"
 *   preparing  → bouton "Prête"
 *   ready      → en attente du livreur (bouton grisé)
 *   picked_up  → en livraison
 *   delivered  → terminé
 *   cancelled  → annulé
 *
 * Rafraîchissement auto toutes les 15s — simule le temps réel
 * sans WebSocket (suffisant pour MVP).
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Order {
  id:              string;
  order_type:      string;
  status:          string;
  total_amount:    number;
  subtotal:        number;
  delivery_fee:    number;
  delivery_address: string | null;
  payment_method:  string;
  special_instructions: string | null;
  created_at:      string;
  estimated_delivery_at: string | null;
  items: Array<{ name: string; quantity: number; price: number; notes?: string }>;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const TABS = [
  { key: "active",    label: "Actives",    statuses: ["pending", "confirmed", "preparing", "ready", "picked_up"] },
  { key: "completed", label: "Terminées",  statuses: ["delivered"] },
  { key: "cancelled", label: "Annulées",   statuses: ["cancelled"] },
];

/* Label + couleur par statut */
const STATUS_CONFIG: Record<string, { label: string; color: string; nextAction?: string; nextLabel?: string }> = {
  pending:    { label: "En attente",       color: "bg-orange-100 text-orange-700", nextAction: "confirmed",  nextLabel: "✓ Accepter" },
  confirmed:  { label: "Confirmée",        color: "bg-blue-100 text-blue-700",    nextAction: "preparing",  nextLabel: "🍳 Préparer" },
  preparing:  { label: "En préparation",   color: "bg-yellow-100 text-yellow-700",nextAction: "ready",      nextLabel: "✅ Prête !" },
  ready:      { label: "Prête",            color: "bg-green-100 text-green-700" },
  picked_up:  { label: "En livraison 🛵",  color: "bg-purple-100 text-purple-700" },
  delivered:  { label: "Livrée ✓",         color: "bg-gray-100 text-gray-600" },
  cancelled:  { label: "Annulée",          color: "bg-red-100 text-red-600" },
};

const METHOD_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov:          "Moov Money",
  telecel_money: "Telecel Money",
};

/* ============================================================
 * COMPOSANT CARTE COMMANDE
 * ============================================================ */

function OrderCard({
  order,
  onStatusChange,
  updating,
}: {
  order: Order;
  onStatusChange: (id: string, status: string) => Promise<void>;
  updating: boolean;
}) {
  const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600" };
  const time = new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* En-tête commande */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <span className="text-lg">{order.order_type === "delivery" ? "🛵" : "🏃"}</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">
              {order.order_type === "delivery" ? "Livraison" : "À emporter"} · {time}
            </p>
            <p className="text-xs text-gray-400 font-mono">{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
            {cfg.label}
          </span>
          <p className="font-bold text-gray-900">{order.total_amount.toLocaleString()} FCFA</p>
        </div>
      </div>

      {/* Articles */}
      <div className="px-5 py-3 border-b border-gray-100">
        <ul className="space-y-1">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">
                <span className="font-semibold">{item.quantity}×</span> {item.name}
                {item.notes && <span className="text-gray-400 italic ml-1">({item.notes})</span>}
              </span>
              <span className="text-gray-500">{(item.price * item.quantity).toLocaleString()} F</span>
            </li>
          ))}
        </ul>
        {order.special_instructions && (
          <p className="mt-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5 italic">
            📝 {order.special_instructions}
          </p>
        )}
      </div>

      {/* Pied — livraison + paiement + action */}
      <div className="px-5 py-3 flex items-center justify-between gap-4">
        <div className="text-xs text-gray-500 space-y-0.5">
          {order.delivery_address && (
            <p>📍 {order.delivery_address}</p>
          )}
          <p>💳 {METHOD_LABELS[order.payment_method] ?? order.payment_method}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/commandes/${order.id}`}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Détails
          </Link>
          {cfg.nextAction && (
            <button
              onClick={() => void onStatusChange(order.id, cfg.nextAction!)}
              disabled={updating}
              className="px-4 py-1.5 text-xs font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {updating ? "…" : cfg.nextLabel}
            </button>
          )}
          {order.status === "pending" && (
            <button
              onClick={() => void onStatusChange(order.id, "cancelled")}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Refuser
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

export default function CommandesPage() {
  const { user, accessToken } = useAuthStore();
  const [activeTab, setActiveTab]   = useState("active");
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const restaurantId = user?.restaurantId;

  /* --------------------------------------------------------
   * Charger les commandes
   * -------------------------------------------------------- */
  const loadOrders = useCallback(async () => {
    if (!accessToken || !restaurantId) { setLoading(false); return; }

    try {
      const tab = TABS.find((t) => t.key === activeTab)!;
      const statusParam = tab.statuses.join(",");
      const res = await apiClient.get<{ orders: Order[] }>(
        `/restaurants/${restaurantId}/orders?status=${statusParam}&limit=50`
      );
      setOrders(res.orders ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, restaurantId, activeTab]);

  useEffect(() => {
    setLoading(true);
    void loadOrders();
    /* Rafraîchissement auto toutes les 15s pour les commandes actives */
    if (activeTab === "active") {
      const t = setInterval(() => void loadOrders(), 15_000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [loadOrders, activeTab]);

  /* --------------------------------------------------------
   * Changer le statut d'une commande
   * -------------------------------------------------------- */
  async function handleStatusChange(orderId: string, status: string) {
    setUpdatingId(orderId);
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status });
      /* Retirer la commande de la liste active si elle change de catégorie */
      if (activeTab === "active" && ["delivered", "cancelled"].includes(status)) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status } : o)
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
      <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>

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
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">{activeTab === "active" ? "✅" : "📭"}</p>
          <p className="text-gray-500">Aucune commande {activeTab === "active" ? "en cours" : activeTab === "completed" ? "terminée" : "annulée"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              updating={updatingId === order.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
