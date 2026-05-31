"use client";

/**
 * food/mes-commandes/[id]/page.tsx — FD_005 : Détail et suivi de commande
 *
 * Affiche l'état en temps réel d'une commande food delivery avec :
 *   - Timeline de progression (pending → confirmed → preparing → ready → picked_up → delivered)
 *   - Détails restaurant + articles commandés
 *   - Infos du livreur si assigné
 *   - Contact restaurant par téléphone
 *
 * Rafraîchissement automatique toutes les 15 secondes si la commande est active
 * (statut autre que delivered/cancelled). Simule un suivi temps réel sans WebSocket.
 * En production, remplacer par une connexion WebSocket sur /ws/orders/:id/status.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface OrderDetail {
  id: string;
  order_type: string;
  status: string;
  delivery_address: string | null;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: string;
  special_instructions: string | null;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  restaurant: {
    id: string;
    name: string;
    restaurant_type: string;
    address: string;
    phone: string;
    latitude: number | null;
    longitude: number | null;
    city: { name: string };
  };
  driver: {
    id: string;
    vehicle_type: string | null;
    vehicle_plate: string | null;
    current_lat: number | null;
    current_lng: number | null;
    user: { first_name: string; phone: string };
  } | null;
  items: {
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes: string | null;
    menu_item: { id: string; name: string; description: string | null };
  }[];
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/* Les étapes de la timeline dans l'ordre */
const ORDER_STEPS = [
  { status: "pending",    label: "Commande reçue",    icon: "📱",  desc: "Le restaurant va confirmer" },
  { status: "confirmed",  label: "Confirmée",          icon: "✅",  desc: "La préparation commence" },
  { status: "preparing",  label: "En préparation",     icon: "👨‍🍳",  desc: "Votre repas est en cuisine" },
  { status: "ready",      label: "Prête",              icon: "🔔",  desc: "En attente du livreur" },
  { status: "picked_up",  label: "En livraison",       icon: "🛵",  desc: "Le livreur est en route" },
  { status: "delivered",  label: "Livrée !",           icon: "🎉",  desc: "Bon appétit !" },
];

const PAYMENT_LABELS: Record<string, string> = {
  orange_money: "Orange Money",
  moov: "Moov Money",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { success?: string };
}): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  if (!accessToken) {
    router.push("/auth");
    return <></>;
  }

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewRating,  setReviewRating]  = useState(0);
  const [reviewHovered, setReviewHovered] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSent,    setReviewSent]    = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const isSuccess = searchParams.success === "1";

  const fetchOrder = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient.get<OrderDetail>(`/orders/${params.id}`);
      setOrder(res);
    } catch {
      /* Silencieux sur les rafraîchissements automatiques */
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  /*
   * Rafraîchissement automatique toutes les 15 secondes si la commande est active.
   * Évite de maintenir un WebSocket pour le MVP — suffisant pour le suivi.
   */
  useEffect(() => {
    if (!order) return;
    if (["delivered", "cancelled"].includes(order.status)) return;

    const interval = setInterval(() => { void fetchOrder(); }, 15_000);
    return () => clearInterval(interval);
  }, [order, fetchOrder]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#EF2B2D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="font-semibold text-gray-800">Commande introuvable</p>
          <button onClick={() => router.push("/food/mes-commandes")} className="mt-4 text-[#EF2B2D] font-semibold">
            Mes commandes
          </button>
        </div>
      </div>
    );
  }

  const isActive = !["delivered", "cancelled"].includes(order.status);
  const currentStepIndex = ORDER_STEPS.findIndex((s) => s.status === order.status);
  const currentStep = ORDER_STEPS[currentStepIndex];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push("/food/mes-commandes")}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-base">Suivi de commande</h1>
          <p className="text-xs text-gray-400 font-mono"># {order.id.slice(-8).toUpperCase()}</p>
        </div>
        {isActive && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[#EF2B2D] rounded-full animate-pulse" />
            <span className="text-xs text-[#EF2B2D] font-semibold">En direct</span>
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Bannière succès */}
        {isSuccess && (
          <div className="bg-green-500 rounded-2xl p-4 text-center text-white">
            <p className="text-2xl mb-1">🎉</p>
            <p className="font-bold text-lg">Commande passée !</p>
            <p className="text-sm text-white/80 mt-1">
              Le restaurant va confirmer votre commande dans quelques minutes.
            </p>
          </div>
        )}

        {/* Statut actuel + heure estimée */}
        {order.status !== "cancelled" ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-center mb-4">
              <p className="text-4xl mb-2">{currentStep?.icon ?? "🍽️"}</p>
              <p className="font-bold text-xl text-gray-900">{currentStep?.label ?? order.status}</p>
              <p className="text-sm text-gray-500 mt-1">{currentStep?.desc}</p>

              {order.estimated_delivery_at && isActive && (
                <p className="text-sm text-[#EF2B2D] font-semibold mt-2">
                  Livraison estimée à {formatTime(order.estimated_delivery_at)}
                </p>
              )}
              {order.delivered_at && (
                <p className="text-sm text-green-600 font-semibold mt-2">
                  Livrée à {formatTime(order.delivered_at)}
                </p>
              )}
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              {ORDER_STEPS.map((step, idx) => {
                const isDone = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const isFuture = idx > currentStepIndex;

                return (
                  <div key={step.status} className="flex items-center gap-3">
                    {/* Indicateur */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
                      isDone ? "bg-green-500 text-white"
                        : isCurrent ? "bg-[#EF2B2D] text-white shadow-md"
                          : "bg-gray-100 text-gray-400"
                    }`}>
                      {isDone ? "✓" : step.icon}
                    </div>

                    <div className={`flex-1 ${isFuture ? "opacity-40" : ""}`}>
                      <p className={`text-sm font-semibold ${isCurrent ? "text-[#EF2B2D]" : isDone ? "text-green-700" : "text-gray-400"}`}>
                        {step.label}
                      </p>
                    </div>

                    {isCurrent && isActive && (
                      <span className="w-2 h-2 bg-[#EF2B2D] rounded-full animate-pulse flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-red-50 rounded-2xl p-5 text-center">
            <p className="text-3xl mb-2">✕</p>
            <p className="font-bold text-red-700 text-lg">Commande annulée</p>
            {order.cancelled_at && (
              <p className="text-sm text-red-500 mt-1">
                Annulée à {formatTime(order.cancelled_at)}
              </p>
            )}
          </div>
        )}

        {/* Infos livreur (si assigné et commande en livraison) */}
        {order.driver && ["picked_up", "ready", "preparing"].includes(order.status) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 mb-3">Votre livreur</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#EF2B2D]/10 rounded-full flex items-center justify-center text-2xl">
                🛵
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{order.driver.user.first_name}</p>
                {order.driver.vehicle_type && (
                  <p className="text-xs text-gray-500">
                    {order.driver.vehicle_type}
                    {order.driver.vehicle_plate && ` · ${order.driver.vehicle_plate}`}
                  </p>
                )}
              </div>
              <a
                href={`tel:${order.driver.user.phone}`}
                className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </a>
            </div>
          </div>
        )}

        {/* Articles commandés */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-bold text-gray-900">Votre commande</p>
          </div>
          {order.items.map((item, idx) => (
            <div
              key={item.id}
              className={`px-4 py-3 flex items-center gap-3 ${idx < order.items.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">
                  {item.quantity}× {item.menu_item.name}
                </p>
                {item.notes && (
                  <p className="text-xs text-gray-400 italic mt-0.5">"{item.notes}"</p>
                )}
              </div>
              <p className="font-semibold text-gray-700 text-sm">{formatFCFA(item.subtotal)}</p>
            </div>
          ))}
          {/* Récap prix */}
          <div className="px-4 py-3 bg-gray-50 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sous-total</span>
              <span>{formatFCFA(order.subtotal)}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Livraison</span>
                <span>{formatFCFA(order.delivery_fee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-gray-200 pt-1">
              <span>Total</span>
              <span className="text-[#EF2B2D]">{formatFCFA(order.total_amount)}</span>
            </div>
            <p className="text-xs text-gray-400">{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
          </div>
        </div>

        {/* Adresse de livraison */}
        {order.order_type === "delivery" && order.delivery_address && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 mb-2">Adresse de livraison</p>
            <p className="text-sm text-gray-700">{order.delivery_address}</p>
          </div>
        )}

        {/* Instructions spéciales */}
        {order.special_instructions && (
          <div className="bg-amber-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">Instructions spéciales</p>
            <p className="text-sm text-amber-800">{order.special_instructions}</p>
          </div>
        )}

        {/* Contact restaurant */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-3">Le restaurant</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EF2B2D]/10 rounded-xl flex items-center justify-center text-xl">
              🍽️
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{order.restaurant.name}</p>
              <p className="text-xs text-gray-500">{order.restaurant.address}</p>
            </div>
            <a
              href={`tel:${order.restaurant.phone}`}
              className="w-10 h-10 bg-[#EF2B2D]/10 rounded-full flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-[#EF2B2D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Section avis post-livraison */}
        {order.status === "delivered" && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            {reviewSent ? (
              <div className="text-center py-2">
                <p className="text-2xl mb-1">🙏</p>
                <p className="text-sm font-semibold text-gray-700">Merci pour votre avis !</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  Donner mon avis sur {order.restaurant.name}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setReviewHovered(star)}
                      onMouseLeave={() => setReviewHovered(0)}
                      onClick={() => setReviewRating(star)}
                      className="text-3xl transition-transform active:scale-110"
                    >
                      <span className={(reviewHovered || reviewRating) >= star ? "text-amber-400" : "text-gray-200"}>
                        ★
                      </span>
                    </button>
                  ))}
                </div>
                {reviewRating > 0 && (
                  <>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Votre commentaire (optionnel)"
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#EF2B2D] resize-none"
                    />
                    <button
                      onClick={async () => {
                        setReviewSending(true);
                        try {
                          await apiClient.post("/reviews", {
                            entity_type:    "restaurant",
                            entity_id:      order.restaurant.id,
                            rating:         reviewRating,
                            booking_ref_id: order.id,
                            ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}),
                          });
                          setReviewSent(true);
                        } catch { /* already reviewed or error — ignore */ }
                        finally { setReviewSending(false); }
                      }}
                      disabled={reviewSending}
                      className="w-full bg-[#EF2B2D] text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 active:scale-95 transition-all"
                    >
                      {reviewSending ? "Envoi…" : "Publier mon avis"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Bouton recommander */}
        {order.status === "delivered" && (
          <button
            onClick={() => router.push(`/food/${order.restaurant.id}`)}
            className="w-full border-2 border-[#EF2B2D] text-[#EF2B2D] font-bold py-4 rounded-2xl"
          >
            🔄 Commander à nouveau
          </button>
        )}
      </div>
    </div>
  );
}
