"use client";

export const dynamic = "force-dynamic";

/**
 * food/panier/page.tsx — FD_003 : Panier + Checkout
 *
 * Affiche le contenu du panier (depuis useCartStore) et permet de :
 *   1. Modifier les quantités / supprimer des articles
 *   2. Choisir livraison ou retrait sur place
 *   3. Saisir l'adresse de livraison (si delivery)
 *   4. Choisir le moyen de paiement (cash, Orange Money, Moov)
 *   5. Confirmer la commande → POST /orders
 *
 * Après confirmation, le panier est vidé et on redirige vers le détail de la commande.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { apiClient, ApiError } from "@/lib/api";
import PaymentSelector from "@/components/PaymentSelector";

const DELIVERY_FEE_ESTIMATE = 1000; /* FCFA — affiché si pas de coordonnées GPS */

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function PanierPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const cartStore = useCartStore();

  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("orange_money");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get<{ balance_fcfa: number }>("/users/me/wallet")
      .then((r) => setWalletBalance(r.balance_fcfa))
      .catch(() => {});
  }, [accessToken]);

  /* Rediriger si panier vide */
  if (cartStore.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🛒</p>
          <p className="font-bold text-gray-900 text-lg">Votre panier est vide</p>
          <p className="text-sm text-gray-500 mt-1">Ajoutez des plats depuis un restaurant</p>
          <button
            onClick={() => router.push("/food")}
            className="mt-5 bg-[#EF2B2D] text-white font-bold px-6 py-3 rounded-xl"
          >
            Explorer les restaurants
          </button>
        </div>
      </div>
    );
  }

  const { restaurant, items } = cartStore;
  const subtotal = cartStore.subtotal();
  const deliveryFee = orderType === "delivery" ? DELIVERY_FEE_ESTIMATE : 0;
  const total = subtotal + deliveryFee;
  const minOrderMet = subtotal >= (restaurant?.min_order_fcfa ?? 0);

  async function handleOrder(): Promise<void> {
    if (!accessToken) {
      router.push("/auth?redirect=/food/panier");
      return;
    }

    if (!restaurant) return;

    if (orderType === "delivery" && !deliveryAddress.trim()) {
      setOrderError("Veuillez saisir votre adresse de livraison.");
      return;
    }

    if (!minOrderMet) {
      setOrderError(`Commande minimum de ${formatFCFA(restaurant.min_order_fcfa)} non atteinte.`);
      return;
    }

    setIsOrdering(true);
    setOrderError("");

    try {
      /* Étape 1 : créer la commande (statut "pending_payment"). */
      const order = await apiClient.post<{ id: string }>("/orders", {
        restaurant_id: restaurant.id,
        order_type: orderType,
        items: items.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          notes: item.notes,
        })),
        ...(orderType === "delivery" && { delivery_address: deliveryAddress }),
        payment_method: paymentMethod,
        special_instructions: specialInstructions || undefined,
      });

      if (paymentMethod === "wallet") {
        /*
         * Paiement portefeuille — instantané, pas de redirection.
         * L'API débite le solde et confirme la commande en une transaction.
         */
        await apiClient.post("/payments/wallet/pay", {
          booking_type: "food",
          booking_id:   order.id,
        });
        cartStore.clearCart();
        router.push(`/food/mes-commandes/${order.id}?paid=wallet`);
      } else {
        /*
         * Paiement Mobile Money via CinetPay.
         * On reçoit payment_url — on redirige le client dessus.
         */
        const paymentRes = await apiClient.post<{ payment_url: string; payment_id: string }>(
          "/payments/initiate",
          { booking_type: "food", booking_id: order.id }
        );
        cartStore.clearCart();
        window.location.href = paymentRes.payment_url;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setOrderError(err.message);
      } else {
        setOrderError("Erreur réseau — vérifiez votre connexion.");
      }
    } finally {
      setIsOrdering(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-base">Votre panier</h1>
          <p className="text-xs text-gray-500">{restaurant?.name}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Articles du panier */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {items.map((item, idx) => (
            <div
              key={item.menu_item_id}
              className={`px-4 py-3 flex items-center gap-3 ${idx < items.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                <p className="text-xs text-[#EF2B2D] font-bold">{formatFCFA(item.price)} × {item.quantity}</p>
                {item.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 italic">"{item.notes}"</p>
                )}
              </div>

              {/* Contrôles quantité */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => cartStore.updateQuantity(item.menu_item_id, item.quantity - 1)}
                  className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-700"
                >
                  −
                </button>
                <span className="w-5 text-center font-bold text-sm">{item.quantity}</span>
                <button
                  onClick={() => cartStore.updateQuantity(item.menu_item_id, item.quantity + 1)}
                  className="w-7 h-7 bg-[#EF2B2D] rounded-full flex items-center justify-center text-sm font-bold text-white"
                >
                  +
                </button>
              </div>

              <p className="text-sm font-bold text-gray-900 w-20 text-right flex-shrink-0">
                {formatFCFA(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {/* Commande minimum non atteinte */}
        {!minOrderMet && (
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs font-semibold text-red-600">
              Commande minimum : {formatFCFA(restaurant?.min_order_fcfa ?? 0)}.
              Il manque {formatFCFA((restaurant?.min_order_fcfa ?? 0) - subtotal)}.
            </p>
          </div>
        )}

        {/* Type de commande */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-3">Mode de commande</p>
          <div className="grid grid-cols-2 gap-3">
            {(["delivery", "pickup"] as const).map((mode) => {
              const available = mode === "delivery" ? restaurant?.offers_delivery : restaurant?.offers_pickup;
              if (!available) return null;
              return (
                <button
                  key={mode}
                  onClick={() => setOrderType(mode)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    orderType === mode
                      ? "border-[#EF2B2D] bg-[#EF2B2D]/5"
                      : "border-gray-200"
                  }`}
                >
                  <p className="text-xl mb-1">{mode === "delivery" ? "🛵" : "🏃"}</p>
                  <p className="font-semibold text-sm text-gray-800">
                    {mode === "delivery" ? "Livraison" : "À emporter"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {mode === "delivery" ? `~${DELIVERY_FEE_ESTIMATE.toLocaleString("fr-FR")} FCFA` : "Gratuit"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Adresse de livraison */}
        {orderType === "delivery" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 mb-3">Adresse de livraison</p>
            <textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Ex : Secteur 15, Rue des Peulhs, Porte bleue en face de la pharmacie..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF2B2D]/30 resize-none h-20"
            />
            <p className="text-xs text-gray-400 mt-1">
              Soyez précis — le livreur utilisera cette description pour vous trouver.
            </p>
          </div>
        )}

        {/* Instructions spéciales */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-2">Instructions (optionnel)</p>
          <input
            type="text"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="Ex : Sonnez au portail, sans piment..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF2B2D]/30"
          />
        </div>

        {/* Mode de paiement */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-3">Paiement</p>
          <PaymentSelector
            selected={paymentMethod}
            onChange={setPaymentMethod}
            walletBalance={walletBalance}
          />
        </div>

        {/* Récapitulatif des prix */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-3">Récapitulatif</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Sous-total ({cartStore.totalItems()} article{cartStore.totalItems() > 1 ? "s" : ""})</span>
              <span className="font-semibold">{formatFCFA(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                {orderType === "delivery" ? "Frais de livraison" : "À emporter"}
              </span>
              <span className={`font-semibold ${deliveryFee === 0 ? "text-green-600" : ""}`}>
                {deliveryFee === 0 ? "Gratuit" : formatFCFA(deliveryFee)}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-[#EF2B2D] text-lg">{formatFCFA(total)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ⏱ Temps estimé : {(restaurant?.avg_prep_minutes ?? 30) + (orderType === "delivery" ? 15 : 0)} min
          </p>
        </div>

        {/* Erreur */}
        {orderError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{orderError}</p>
          </div>
        )}
      </div>

      {/* Bouton de commande fixe */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-2xl">
        <button
          onClick={() => void handleOrder()}
          disabled={isOrdering || !minOrderMet}
          className="w-full bg-[#EF2B2D] text-white font-bold py-4 rounded-2xl disabled:opacity-40 active:scale-[0.99] transition-all text-base"
        >
          {isOrdering
            ? (paymentMethod === "wallet" ? "Paiement en cours…" : "Redirection vers le paiement…")
            : `Payer · ${formatFCFA(total)}`
          }
        </button>
        {!accessToken && (
          <p className="text-xs text-center text-gray-400 mt-2">
            Vous serez redirigé vers la connexion
          </p>
        )}
      </div>
    </div>
  );
}
