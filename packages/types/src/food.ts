/**
 * food.ts — Types pour le module Food Delivery de VIVRE
 *
 * Le food delivery est opéré via le réseau de zémidjans déjà utilisé pour le transport.
 * Cela maximise l'utilisation des chauffeurs et réduit les coûts de livraison.
 *
 * Contexte local Burkina Faso :
 * - Le "maquis" est l'établissement dominant (cuisine locale à 500-2000 FCFA)
 * - Les livraisons se font principalement à moto (zémidjan)
 * - Cash est encore fréquent même pour les livraisons
 * - La "pharmacie de garde" (module services publics) est un concept parallèle
 *   mais le restaurant "ouvert maintenant" est filtré de façon similaire
 */

import type { UUID, Timestamps, GeoCoordinates } from "./common.js";
import type { RestaurantType, OrderType, OrderStatus, OrderPaymentMethod } from "./enums.js";

/* ============================================================
 * RESTAURANTS
 * ============================================================ */

/**
 * Restaurant ou établissement de restauration.
 * opening_hours est un objet JSON flexible pour gérer les horaires irréguliers
 * (ex: certains maquis ferment pendant les heures de fortes chaleurs).
 *
 * Format opening_hours :
 * { "mon": "08:00-22:00", "tue": "08:00-22:00", ..., "sun": "closed" }
 */
export interface Restaurant extends Timestamps {
  id: UUID;
  owner_id: UUID;
  city_id: UUID;
  name: string;
  restaurant_type: RestaurantType;
  description?: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  opening_hours: Record<string, string>; /* Format: { "mon": "08:00-22:00" } */
  delivery_radius_km: number;   /* Rayon de livraison en km — défaut: 5km */
  min_order_fcfa: number;       /* Commande minimum en FCFA */
  avg_prep_minutes: number;     /* Temps de préparation moyen — défaut: 30 min */
  offers_delivery: boolean;
  offers_pickup: boolean;
  is_approved: boolean;
  is_active: boolean;
  is_open_now: boolean;         /* Calculé en temps réel côté serveur */
  rating_avg: number;
}

/**
 * Catégorie de menu d'un restaurant.
 * Ex: "Entrées", "Plats chauds", "Grillades", "Boissons", "Desserts"
 */
export interface MenuCategory extends Timestamps {
  id: UUID;
  restaurant_id: UUID;
  name: string;
  sort_order: number; /* Ordre d'affichage dans le menu */
  is_active: boolean;
}

/**
 * Plat ou article du menu.
 * is_featured = true → affiché en "À la une" sur la page du restaurant.
 */
export interface MenuItem extends Timestamps {
  id: UUID;
  restaurant_id: UUID;
  category_id: UUID;
  name: string;
  description?: string;
  price: number;          /* FCFA */
  image_url?: string;
  is_available: boolean;  /* Peut être désactivé temporairement (rupture de stock) */
  is_featured: boolean;
  prep_minutes?: number;  /* Temps de prep spécifique à ce plat (si différent du défaut) */
  sort_order: number;
}

/**
 * Menu complet d'un restaurant — retourné par GET /restaurants/:id/menu.
 * Organisé par catégories avec les plats de chaque catégorie.
 */
export interface RestaurantMenu {
  categories: Array<{
    id: UUID;
    name: string;
    items: MenuItem[];
  }>;
}

/* ============================================================
 * COMMANDES
 * ============================================================ */

/**
 * Commande food delivery ou click & collect.
 * driver_id est null jusqu'à ce qu'un zémidjan accepte la livraison.
 */
export interface Order extends Timestamps {
  id: UUID;
  user_id: UUID;
  restaurant_id: UUID;
  driver_id?: UUID;              /* Zémidjan assigné à la livraison */
  order_type: OrderType;
  delivery_address?: string;     /* null si pickup */
  delivery_lat?: number;
  delivery_lng?: number;
  subtotal: number;              /* FCFA — total des articles sans livraison */
  delivery_fee: number;          /* FCFA — 0 si pickup */
  total_amount: number;          /* subtotal + delivery_fee - promo */
  status: OrderStatus;
  payment_method: OrderPaymentMethod;
  payment_id?: UUID;
  special_instructions?: string;
  estimated_delivery_at?: string; /* ISO 8601 — estimé à la confirmation */
  delivered_at?: string;
  cancelled_at?: string;
}

/**
 * Article d'une commande — snapshot du menu_item au moment de la commande.
 * On copie le prix unitaire pour que les futures modifications de prix
 * n'affectent pas les commandes passées.
 */
export interface OrderItem {
  id: UUID;
  order_id: UUID;
  menu_item_id: UUID;
  quantity: number;
  unit_price: number;  /* FCFA au moment de la commande */
  subtotal: number;    /* unit_price × quantity */
  notes?: string;      /* Instructions spéciales pour ce plat */
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête POST /orders — création d'une commande.
 */
export interface CreateOrderRequest {
  restaurant_id: UUID;
  order_type: OrderType;
  items: Array<{
    menu_item_id: UUID;
    quantity: number;
    notes?: string;
  }>;
  delivery_address?: string; /* Requis si order_type = "delivery" */
  delivery_lat?: number;
  delivery_lng?: number;
  payment_method: OrderPaymentMethod;
  promo_code?: string;
  special_instructions?: string;
}

/**
 * Card de restaurant dans les listes de résultats.
 * Version légère du Restaurant — sans les données de menu.
 */
export interface RestaurantCard {
  id: UUID;
  name: string;
  restaurant_type: RestaurantType;
  rating_avg: number;
  avg_prep_minutes: number;
  delivery_fee: number;       /* Calculé selon la distance client-restaurant */
  min_order_fcfa: number;
  is_open: boolean;
  thumbnail?: string;         /* URL de la photo principale */
  distance_km?: number;       /* Calculé si lat/lng fournis dans la recherche */
}

/**
 * Mise à jour de statut de commande via WebSocket.
 * Le client reçoit ces messages sur /ws/orders/:id/status en temps réel.
 */
export interface OrderStatusUpdate {
  status: OrderStatus;
  message: string;      /* Message humain en français (ex: "Votre commande est prête !") */
  eta_minutes?: number; /* Temps restant estimé en minutes */
}

/**
 * Position du livreur retournée par GET /orders/:id/driver-location.
 */
export interface DriverLocation {
  lat: number;
  lng: number;
  name: string;          /* Prénom du livreur */
  phone: string;
  vehicle_type?: string;
  eta_minutes: number;
}
