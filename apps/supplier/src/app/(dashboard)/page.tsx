"use client";

/**
 * (dashboard)/page.tsx — Tableau de bord fournisseur VIVRE
 *
 * Vue d'ensemble en temps réel :
 *   - Statistiques du jour (commandes, chiffre d'affaires)
 *   - Commandes actives en attente de confirmation
 *   - Accès rapide aux actions courantes
 *
 * Rafraîchissement automatique toutes les 30 secondes
 * pour les restaurants avec des commandes actives.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface DashboardStats {
  today_orders:    number;
  today_revenue:   number;
  pending_orders:  number;
  avg_prep_minutes: number;
}

interface PendingOrder {
  id:           string;
  order_type:   string;
  status:       string;
  total_amount: number;
  subtotal:     number;
  delivery_fee: number;
  created_at:   string;
  items_count:  number;
}

/* ============================================================
 * COMPOSANT STAT CARD
 * ============================================================ */

function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function DashboardPage() {
  const { user, accessToken } = useAuthStore();
  const [stats, setStats]           = useState<DashboardStats | null>(null);
  const [pendingOrders, setPending]  = useState<PendingOrder[]>([]);
  const [loading, setLoading]        = useState(true);
  const [confirming, setConfirming]  = useState<string | null>(null);
  const [error, setError]            = useState<string | null>(null);

  const isRestaurant = user?.supplierType === "restaurant" || user?.supplierType === "both";

  /* --------------------------------------------------------
   * Charger les stats + commandes en attente
   * -------------------------------------------------------- */
  const loadData = useCallback(async () => {
    if (!accessToken || !isRestaurant || !user?.restaurantId) {
      setLoading(false);
      return;
    }

    try {
      const [ordersRes] = await Promise.all([
        apiClient.get<{ orders: PendingOrder[]; total: number }>(
          `/restaurants/${user.restaurantId}/orders?status=pending&limit=5`
        ),
      ]);

      setPending(ordersRes.orders ?? []);

      /* Calculer les stats du jour depuis les commandes */
      const todayRes = await apiClient.get<{ orders: Array<{ total_amount: number; status: string }> }>(
        `/restaurants/${user.restaurantId}/orders?limit=100`
      );
      const today = new Date().toDateString();
      const todayOrders = (todayRes.orders ?? []).filter((o) =>
        new Date(o.total_amount).toDateString() === today
      );
      setStats({
        today_orders:     todayOrders.length,
        today_revenue:    todayOrders.reduce((s, o) => s + o.total_amount, 0),
        pending_orders:   ordersRes.total ?? 0,
        avg_prep_minutes: 25,
      });

      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, isRestaurant, user?.restaurantId]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  /* --------------------------------------------------------
   * Confirmer rapidement une commande depuis le dashboard
   * -------------------------------------------------------- */
  async function confirmOrder(orderId: string) {
    setConfirming(orderId);
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status: "confirmed" });
      setPending((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setConfirming(null);
    }
  }

  /* ============================================================
   * RENDER
   * ============================================================ */
  const displayName = user?.first_name ?? "Fournisseur";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {displayName} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats du jour */}
      {isRestaurant && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Commandes aujourd'hui" value={stats?.today_orders ?? "—"} icon="📦" color="text-blue-600" />
          <StatCard label="CA aujourd'hui (FCFA)" value={stats?.today_revenue?.toLocaleString() ?? "—"} icon="💰" color="text-green-600" />
          <StatCard label="En attente" value={stats?.pending_orders ?? pendingOrders.length} icon="⏳" color="text-orange-600" />
          <StatCard label="Délai moyen (min)" value={stats?.avg_prep_minutes ?? "—"} icon="⏱️" color="text-purple-600" />
        </div>
      )}

      {/* Commandes en attente — action immédiate */}
      {isRestaurant && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-lg">
              Commandes en attente
              {pendingOrders.length > 0 && (
                <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                  {pendingOrders.length}
                </span>
              )}
            </h2>
            <Link href="/commandes" className="text-sm text-orange-600 font-medium hover:underline">
              Voir tout →
            </Link>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">
              Chargement…
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-gray-500 text-sm">Aucune commande en attente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{order.order_type === "delivery" ? "🛵" : "🏃"}</span>
                      <p className="font-semibold text-gray-900 text-sm">
                        {order.order_type === "delivery" ? "Livraison" : "À emporter"}
                        {" · "}
                        <span className="text-orange-600">{order.total_amount.toLocaleString()} FCFA</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Reçue à {new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/commandes/${order.id}`}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Détails
                    </Link>
                    <button
                      onClick={() => void confirmOrder(order.id)}
                      disabled={confirming === order.id}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {confirming === order.id ? "…" : "✓ Confirmer"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accès rapide */}
      <div>
        <h2 className="font-bold text-gray-900 text-lg mb-3">Accès rapide</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isRestaurant && (
            <>
              <Link href="/commandes" className="bg-white rounded-xl p-4 text-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <p className="text-3xl mb-1">📋</p>
                <p className="text-sm font-medium text-gray-700">Commandes</p>
              </Link>
              <Link href="/menu" className="bg-white rounded-xl p-4 text-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <p className="text-3xl mb-1">🍽️</p>
                <p className="text-sm font-medium text-gray-700">Menu</p>
              </Link>
              <Link href="/restaurant" className="bg-white rounded-xl p-4 text-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <p className="text-3xl mb-1">⚙️</p>
                <p className="text-sm font-medium text-gray-700">Paramètres</p>
              </Link>
            </>
          )}
          {(user?.supplierType === "property" || user?.supplierType === "both") && (
            <Link href="/reservations" className="bg-white rounded-xl p-4 text-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <p className="text-3xl mb-1">🏨</p>
              <p className="text-sm font-medium text-gray-700">Réservations</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
