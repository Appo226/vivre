/**
 * store/cart.store.ts — Panier de commande food delivery
 *
 * Ce store Zustand gère l'état du panier de l'utilisateur.
 * Le panier est lié à UN SEUL restaurant à la fois : si l'utilisateur
 * ajoute un article d'un autre restaurant, le panier est vidé automatiquement
 * et remplacé. L'utilisateur est averti côté UI avant la suppression.
 *
 * Persistance : le panier est sauvegardé en localStorage pour survivre
 * aux rechargements de page. Il est nettoyé après une commande passée.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ============================================================
 * TYPES
 * ============================================================ */

export interface CartItem {
  menu_item_id: string;
  name: string;
  price: number;        /* FCFA */
  quantity: number;
  notes?: string;       /* Instructions spéciales pour ce plat */
}

export interface CartRestaurant {
  id: string;
  name: string;
  min_order_fcfa: number;
  avg_prep_minutes: number;
  offers_delivery: boolean;
  offers_pickup: boolean;
  city_name: string;
}

interface CartState {
  restaurant: CartRestaurant | null;
  items: CartItem[];

  /* Actions */
  addItem: (restaurant: CartRestaurant, item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  updateNotes: (menuItemId: string, notes: string) => void;
  clearCart: () => void;

  /* Sélecteurs */
  totalItems: () => number;
  subtotal: () => number;
}

/* ============================================================
 * STORE
 * ============================================================ */

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      restaurant: null,
      items: [],

      /**
       * Ajoute un article au panier.
       * Si l'article vient d'un autre restaurant, le panier est vidé.
       * Si l'article est déjà dans le panier, la quantité est incrémentée.
       */
      addItem: (restaurant, item, quantity = 1) => {
        const { restaurant: currentRestaurant, items } = get();

        /* Changement de restaurant — vider le panier */
        if (currentRestaurant && currentRestaurant.id !== restaurant.id) {
          set({ restaurant, items: [{ ...item, quantity }] });
          return;
        }

        /* Même restaurant — ajouter ou incrémenter */
        const existingIndex = items.findIndex((i) => i.menu_item_id === item.menu_item_id);
        if (existingIndex >= 0) {
          const updated = [...items];
          updated[existingIndex] = {
            ...updated[existingIndex]!,
            quantity: (updated[existingIndex]!.quantity) + quantity,
          };
          set({ restaurant, items: updated });
        } else {
          set({ restaurant, items: [...items, { ...item, quantity }] });
        }
      },

      removeItem: (menuItemId) => {
        const items = get().items.filter((i) => i.menu_item_id !== menuItemId);
        /* Si le panier est vide, on réinitialise aussi le restaurant */
        set({ items, restaurant: items.length === 0 ? null : get().restaurant });
      },

      updateQuantity: (menuItemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.menu_item_id === menuItemId ? { ...i, quantity } : i
          ),
        });
      },

      updateNotes: (menuItemId, notes) => {
        set({
          items: get().items.map((i) => {
            if (i.menu_item_id !== menuItemId) return i;
            /*
             * exactOptionalPropertyTypes : on ne peut pas assigner undefined à notes?.
             * On utilise une déstructuration conditionnelle pour soit inclure notes
             * (si non vide) soit omettre complètement la propriété.
             */
            const { notes: _prev, ...base } = i;
            return notes ? { ...base, notes } : base as CartItem;
          }),
        });
      },

      clearCart: () => set({ restaurant: null, items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: "vivre-cart", /* Clé localStorage */
    }
  )
);
