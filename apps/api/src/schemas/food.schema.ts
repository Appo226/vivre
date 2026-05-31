/**
 * schemas/food.schema.ts — Schémas Zod pour le module Food Delivery (Étape 7)
 *
 * Contexte burkinabè :
 *   - Le "maquis" est l'établissement dominant (cuisine locale, 500-2000 FCFA le plat)
 *   - Les livraisons se font à moto (zémidjan) — réseau déjà intégré
 *   - Paiement cash encore très courant même pour les commandes en ligne
 *   - Rayon de livraison typique : 2-5 km dans les grandes villes
 */

import { z } from "zod";

/* Types d'établissements de restauration au Burkina */
const RESTAURANT_TYPES = ["restaurant", "maquis", "fastfood", "bakery", "street_food"] as const;

/*
 * Méthodes de paiement — cash EXCLU intentionnellement.
 * Le cash à la livraison crée un vecteur de fraude (commandes non payées à la porte).
 * Toutes les commandes food doivent être prépayées via mobile money.
 */
const PAYMENT_METHODS = ["orange_money", "moov"] as const;

/* ============================================================
 * LISTE / RECHERCHE DE RESTAURANTS
 * ============================================================ */

export const RestaurantListSchema = z.object({
  city_id:          z.string().uuid().optional(),
  restaurant_type:  z.enum(RESTAURANT_TYPES).optional(),
  q:                z.string().max(100).optional(),     /* Recherche textuelle nom/adresse */
  open_now:         z.coerce.boolean().optional(),      /* Filtre sur is_open_now */
  offers_delivery:  z.coerce.boolean().optional(),
  offers_pickup:    z.coerce.boolean().optional(),
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(50).default(20),
});

/* ============================================================
 * CRÉATION DE RESTAURANT (fournisseur)
 * ============================================================ */

export const CreateRestaurantSchema = z.object({
  city_id:           z.string().uuid(),
  name:              z.string().min(2).max(200),
  restaurant_type:   z.enum(RESTAURANT_TYPES),
  description:       z.string().min(10).max(3000).optional(),
  address:           z.string().min(5).max(500),
  latitude:          z.number().min(-90).max(90),
  longitude:         z.number().min(-180).max(180),
  phone:             z.string().min(8).max(20),
  /*
   * opening_hours : objet JSON souple — chaque clé est un jour de semaine en anglais 3 lettres
   * (mon, tue, wed, thu, fri, sat, sun) et la valeur est "HH:MM-HH:MM" ou "closed".
   * Ex: { "mon": "08:00-22:00", "sun": "closed" }
   */
  opening_hours:     z.record(z.string()),
  delivery_radius_km: z.number().min(0).max(50).default(5),
  min_order_fcfa:    z.number().int().min(0).default(0),
  avg_prep_minutes:  z.number().int().min(5).max(120).default(30),
  offers_delivery:   z.boolean().default(true),
  offers_pickup:     z.boolean().default(true),
});

/* ============================================================
 * CRÉATION D'UNE CATÉGORIE DE MENU (fournisseur)
 * ============================================================ */

export const CreateMenuCategorySchema = z.object({
  name:       z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
});

/* ============================================================
 * CRÉATION D'UN PLAT (fournisseur)
 * ============================================================ */

export const CreateMenuItemSchema = z.object({
  category_id:  z.string().uuid(),
  name:         z.string().min(1).max(200),
  description:  z.string().max(1000).optional(),
  price:        z.number().int().min(0),   /* FCFA */
  image_url:    z.string().url().optional(),
  is_available: z.boolean().default(true),
  is_featured:  z.boolean().default(false),
  prep_minutes: z.number().int().min(1).max(120).optional(),
  sort_order:   z.number().int().min(0).default(0),
});

/* ============================================================
 * CRÉATION D'UNE COMMANDE (client)
 * ============================================================ */

export const CreateOrderSchema = z.object({
  restaurant_id: z.string().uuid(),
  order_type:    z.enum(["delivery", "pickup"]),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity:     z.number().int().min(1).max(50),
    notes:        z.string().max(500).optional(), /* Instructions spécifiques pour ce plat */
  })).min(1, "Au moins 1 article requis"),
  /*
   * delivery_address est obligatoire si order_type = "delivery".
   * La validation croisée est faite dans le handler API.
   */
  delivery_address: z.string().min(5).max(500).optional(),
  delivery_lat:     z.number().min(-90).max(90).optional(),
  delivery_lng:     z.number().min(-180).max(180).optional(),
  payment_method:   z.enum(PAYMENT_METHODS).default("orange_money"),
  special_instructions: z.string().max(500).optional(),
});

/* ============================================================
 * MISE À JOUR DU STATUT D'UNE COMMANDE
 * ============================================================ */

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled"]),
  note:   z.string().max(300).optional(), /* Message optionnel affiché au client */
});

/* ============================================================
 * TYPES INFÉRÉS
 * ============================================================ */

export type RestaurantListInput = z.infer<typeof RestaurantListSchema>;
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>;
export type CreateMenuCategoryInput = z.infer<typeof CreateMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
