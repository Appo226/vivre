"use client";

/**
 * commandes/[id]/page.tsx — Détail d'une commande
 *
 * Affiche toutes les informations d'une commande :
 *   - En-tête : statut, type, horodatage
 *   - Client et livreur assigné (si applicable)
 *   - Liste complète des articles commandés
 *   - Adresse de livraison + instructions spéciales
 *   - Récapitulatif financier (sous-total, frais, total)
 *   - Boutons d'action pour avancer le statut ou annuler
 *
 * Accessible uniquement par le propriétaire du restaurant
 * (contrôle d'accès côté API — le supplier est vérifié via token).
 */

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface OrderDetail {
  id:              string;
  order_type:      "delivery" | "pickup";
  status:          string;
  subtotal:        number;
  delivery_fee:    number;
  total_amount:    number;
  payment_method:  string;
  delivery_address: string | null;
  special_instructions: string | null;
  created_at:      string;
  estimated_delivery_at: string | null;
  delivered_at:    string | null;
  cancelled_at:    string | null;
  user: {
    first_name: string | null;
    last_name:  string | null;
    phone:      string;
  } | null;
  driver: {
    vehicle_type:  string;
    vehicle_plate: string;
    user: { first_name: string | null; phone: string };
  } | null;
  items: Array<{
    id:        string;
    quantity:  number;
    unit_price: number;
    subtotal:  number;
    notes:     string | null;
    menu_item: { id: string; name: string; description: string | null };
  }>;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const STATUS_CONFIG: Record<string, { label: string; color: string; nextAction?: string; nextLabel?: string }> = {
  pending_payment: { label: "Attente paiement",    color: "bg-gray-100 text-gray-500" },
  pending:         { label: "En attente",           color: "bg-orange-100 text-orange-700", nextAction: "confirmed", nextLabel: "✓ Accepter la commande" },
  confirmed:       { label: "Confirmée",            color: "bg-blue-100 text-blue-700",    nextAction: "preparing", nextLabel: "🍳 Démarrer la préparation" },
  preparing:       { label: "En préparation",       color: "bg-yellow-100 text-yellow-700",nextAction: "ready",     nextLabel: "✅ Marquer comme prête" },
  ready:           { label: "Prête",                color: "bg-green-100 text-green-700" },
  picked_up:       { label: "En livraison 🛵",      color: "bg-purple-100 text-purple-700" },
  delivered:       { label: "Livrée ✓",             color: "bg-gray-100 text-gray-600" },
  cancelled:       { label: "Annulée",              color: "bg-red-100 text-red-600" },
};

const PAYMENT_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov:          "Moov Money",
  telecel_money: "Telecel Money",
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function OrderDetailPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const { accessToken } = useAuthStore();

  const [order, setOrder]     = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  /* --------------------------------------------------------
   * Charger le détail de la commande
   * -------------------------------------------------------- */
  useEffect(() => {
    if (!accessToken || !params.id) return;

    void (async () => {
      try {
        const res = await apiClient.get<OrderDetail>(`/orders/${params.id}`);
        setOrder(res);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken, params.id]);

  /* --------------------------------------------------------
   * Changer le statut
   * -------------------------------------------------------- */
  async function handleStatusChange(status: string) {
    if (!order) return;
    setUpdating(true);
    try {
      await apiClient.patch(`/orders/${order.id}/status`, { status });
      setOrder((prev) => prev ? { ...prev, status } : prev);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-lg w-48" />
        <div className="h-48 bg-white rounded-xl border border-gray-100" />
        <div className="h-64 bg-white rounded-xl border border-gray-100" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">{error ?? "Commande introuvable"}</p>
          <Link href="/commandes" className="mt-4 inline-block text-sm text-orange-600 hover:underline">
            ← Retour aux commandes
          </Link>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600" };
  const createdTime = new Date(order.created_at).toLocaleString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const customerName = order.user
    ? [order.user.first_name, order.user.last_name].filter(Boolean).join(" ") || order.user.phone
    : "Client inconnu";

  return (
    <div className="max-w-2xl space-y-4">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Commande #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-xs text-gray-400">{createdTime}</p>
          </div>
        </div>
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* ── Type + client ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{order.order_type === "delivery" ? "🛵" : "🏃"}</span>
            <div>
              <p className="font-semibold text-gray-900">
                {order.order_type === "delivery" ? "Livraison à domicile" : "À emporter"}
              </p>
              {order.delivery_address && (
                <p className="text-sm text-gray-500 mt-0.5">📍 {order.delivery_address}</p>
              )}
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Client</p>
          <p className="font-medium text-gray-900">{customerName}</p>
          {order.user?.phone && (
            <p className="text-sm text-gray-500">{order.user.phone}</p>
          )}
        </div>

        {/* Livreur (si assigné) */}
        {order.driver && (
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Livreur assigné</p>
            <p className="font-medium text-gray-900">
              {order.driver.user.first_name ?? "Livreur"} · {order.driver.vehicle_type}
            </p>
            <p className="text-sm text-gray-500">
              {order.driver.vehicle_plate} · {order.driver.user.phone}
            </p>
          </div>
        )}

        {/* Paiement */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Paiement</p>
          <p className="font-medium text-gray-900">
            💳 {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
          </p>
        </div>
      </div>

      {/* ── Articles commandés ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="font-semibold text-gray-900 text-sm">
            Articles ({order.items.reduce((s, i) => s + i.quantity, 0)})
          </p>
        </div>
        <ul className="divide-y divide-gray-100">
          {order.items.map((item) => (
            <li key={item.id} className="px-5 py-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">
                  <span className="text-orange-600">{item.quantity}×</span> {item.menu_item.name}
                </p>
                {item.notes && (
                  <p className="text-xs text-gray-400 italic mt-0.5">Note : {item.notes}</p>
                )}
              </div>
              <p className="text-sm text-gray-700 font-medium flex-shrink-0">
                {item.subtotal.toLocaleString()} F
              </p>
            </li>
          ))}
        </ul>

        {/* Instructions spéciales */}
        {order.special_instructions && (
          <div className="px-5 pb-4">
            <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2 italic">
              📝 {order.special_instructions}
            </p>
          </div>
        )}
      </div>

      {/* ── Récapitulatif financier ── */}
      <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Sous-total articles</span>
          <span>{order.subtotal.toLocaleString()} FCFA</span>
        </div>
        {order.delivery_fee > 0 && (
          <div className="flex justify-between text-sm text-gray-500">
            <span>Frais de livraison</span>
            <span>{order.delivery_fee.toLocaleString()} FCFA</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
          <span>Total</span>
          <span>{order.total_amount.toLocaleString()} FCFA</span>
        </div>
      </div>

      {/* ── Actions ── */}
      {(cfg.nextAction || order.status === "pending") && (
        <div className="flex gap-3">
          {order.status === "pending" && (
            <button
              onClick={() => void handleStatusChange("cancelled")}
              disabled={updating}
              className="flex-1 py-3 text-sm font-medium border border-red-200 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Refuser la commande
            </button>
          )}
          {cfg.nextAction && (
            <button
              onClick={() => void handleStatusChange(cfg.nextAction!)}
              disabled={updating}
              className="flex-1 py-3 text-sm font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {updating ? "Mise à jour…" : cfg.nextLabel}
            </button>
          )}
        </div>
      )}

      {/* Timestamp de livraison ou annulation */}
      {order.delivered_at && (
        <p className="text-center text-sm text-gray-400">
          Livrée le {new Date(order.delivered_at).toLocaleString("fr-FR")}
        </p>
      )}
      {order.cancelled_at && (
        <p className="text-center text-sm text-red-400">
          Annulée le {new Date(order.cancelled_at).toLocaleString("fr-FR")}
        </p>
      )}

    </div>
  );
}
