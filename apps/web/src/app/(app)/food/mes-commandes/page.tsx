"use client";

export const dynamic = "force-dynamic";

/**
 * food/mes-commandes/page.tsx — FD_004 : Mes commandes food delivery
 *
 * Liste toutes les commandes de l'utilisateur avec filtres :
 *   - En cours : pending, confirmed, preparing, ready, picked_up
 *   - Livrées : delivered
 *   - Annulées : cancelled
 *
 * Un clic sur une commande ouvre le détail avec le suivi en temps réel (FD_005).
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface OrderSummary {
  id: string;
  order_type: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: string;
  created_at: string;
  delivered_at: string | null;
  restaurant: { id: string; name: string; restaurant_type: string; address: string };
  items: { quantity: number; menu_item: { name: string } }[];
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

type FilterKey = "all" | "active" | "completed" | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Toutes" },
  { key: "active",    label: "En cours" },
  { key: "completed", label: "Livrées" },
  { key: "cancelled", label: "Annulées" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:    { label: "En attente",   color: "text-amber-700",  bg: "bg-amber-50",  icon: "⏳" },
  confirmed:  { label: "Confirmée",    color: "text-blue-700",   bg: "bg-blue-50",   icon: "✅" },
  preparing:  { label: "En préparation", color: "text-orange-700", bg: "bg-orange-50", icon: "👨‍🍳" },
  ready:      { label: "Prête",        color: "text-purple-700", bg: "bg-purple-50", icon: "🔔" },
  picked_up:  { label: "En livraison", color: "text-blue-700",   bg: "bg-blue-50",   icon: "🛵" },
  delivered:  { label: "Livrée",       color: "text-green-700",  bg: "bg-green-50",  icon: "✓" },
  cancelled:  { label: "Annulée",      color: "text-red-600",    bg: "bg-red-50",    icon: "✕" },
};

const RESTAURANT_TYPE_ICONS: Record<string, string> = {
  restaurant: "🍴", maquis: "🫕", fastfood: "🍔", bakery: "🥖", street_food: "🌯",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function MesCommandesPage(): React.ReactElement | null {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useEffect(() => { if (!accessToken) { router.push("/auth?redirect=/food/mes-commandes"); } }, [accessToken, router]);

  if (!accessToken) return null;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    apiClient
      .get<{ orders: OrderSummary[]; total: number }>(`/orders/me?filter=${filter}`)
      .then((res) => { setOrders(res.orders); setTotal(res.total); })
      .catch(() => setOrders([]))
      .finally(() => setIsLoading(false));
  }, [filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-10 pb-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Mes commandes</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? "Chargement..." : `${total} commande${total > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex overflow-x-auto px-4 pb-3 gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                filter === f.key
                  ? "bg-[#EF2B2D] text-white border-[#EF2B2D]"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-5xl mb-4">🛵</p>
            <p className="font-semibold text-gray-800">Aucune commande</p>
            <p className="text-sm text-gray-500 mt-1">
              {filter === "all"
                ? "Vous n'avez pas encore passé de commande."
                : `Aucune commande "${FILTERS.find((f) => f.key === filter)?.label}".`}
            </p>
            <button
              onClick={() => router.push("/food")}
              className="mt-5 bg-[#EF2B2D] text-white font-bold px-6 py-3 rounded-xl"
            >
              Commander maintenant
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => router.push(`/food/mes-commandes/${order.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * CARTE COMMANDE
 * ============================================================ */

function OrderCard({
  order,
  onClick,
}: {
  order: OrderSummary;
  onClick: () => void;
}): React.ReactElement {
  const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["pending"]!;
  const icon = RESTAURANT_TYPE_ICONS[order.restaurant.restaurant_type] ?? "🍽️";

  /* Résumé des articles : "Riz sauce + 2 autres" */
  const firstItem = order.items[0];
  const itemsSummary = firstItem
    ? order.items.length > 1
      ? `${firstItem.menu_item.name} +${order.items.length - 1} autre${order.items.length > 2 ? "s" : ""}`
      : firstItem.menu_item.name
    : "—";

  const isActive = !["delivered", "cancelled"].includes(order.status);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.99] transition-all"
    >
      {/* Restaurant + statut */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">{order.restaurant.name}</p>
            <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${status.bg} ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* Articles */}
      <p className="text-xs text-gray-600 mb-2">{itemsSummary}</p>

      {/* Bas de carte : type + montant */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">{order.order_type === "delivery" ? "🛵 Livraison" : "🏃 À emporter"}</span>
          {isActive && (
            <span className="w-1.5 h-1.5 bg-[#EF2B2D] rounded-full animate-pulse" />
          )}
        </div>
        <p className="font-bold text-gray-900 text-sm">{formatFCFA(order.total_amount)}</p>
      </div>
    </button>
  );
}
