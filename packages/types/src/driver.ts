/**
 * driver.ts — Types pour l'application Chauffeur (Driver App — Module 11)
 *
 * L'app chauffeur est intégrée dans la même app web (sous /driver)
 * mais avec une interface et des routes API distinctes.
 *
 * Les zémidjans jouent un double rôle dans VIVRE :
 * 1. Transport intraurbain (courses de particulier)
 * 2. Livraison food (quand pas de course en cours)
 * Ce double rôle maximise leurs revenus et réduit les temps morts.
 *
 * Flux d'une course :
 * 1. Chauffeur met is_available = true → début de réception de demandes
 * 2. Demande reçue via WS /ws/drivers/me/requests → popup avec 30s countdown
 * 3. Chauffeur accepte → statut "accepted" → route vers le client
 * 4. Chauffeur met à jour statut : en_route → arrived → in_progress → completed
 * 5. Chauffeur met is_available = true → prêt pour la prochaine course
 */

import type { UUID } from "./common.js";
import type { RideStatus, OrderStatus } from "./enums.js";

/* ============================================================
 * TABLEAU DE BORD CHAUFFEUR
 * ============================================================ */

/**
 * Données du tableau de bord du chauffeur — retourné par GET /driver/me/dashboard.
 */
export interface DriverDashboard {
  is_available: boolean;
  earnings_today: number;     /* FCFA — somme des courses/livraisons du jour */
  rides_today: number;        /* Nombre de courses effectuées aujourd'hui */
  deliveries_today: number;   /* Nombre de livraisons food aujourd'hui */
  avg_rating: number;         /* Note moyenne depuis le début */
  current_ride?: ActiveRideInfo;       /* null si pas de course en cours */
  current_delivery?: ActiveDeliveryInfo; /* null si pas de livraison en cours */
}

/**
 * Course active visible dans le dashboard du chauffeur.
 */
export interface ActiveRideInfo {
  ride_id: UUID;
  status: RideStatus;
  client_name?: string;  /* Prénom du client */
  client_phone: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_price: number; /* FCFA */
}

/**
 * Livraison food active visible dans le dashboard du chauffeur.
 */
export interface ActiveDeliveryInfo {
  order_id: UUID;
  status: OrderStatus;
  restaurant_name: string;
  restaurant_address: string;
  restaurant_phone: string;
  delivery_address: string;
  client_phone: string;
  order_total: number; /* FCFA */
}

/* ============================================================
 * DEMANDES EN TEMPS RÉEL (WebSocket)
 * ============================================================ */

/**
 * Demande reçue via WebSocket /ws/drivers/me/requests.
 * Le chauffeur a 30 secondes pour accepter ou refuser.
 * Après 30s sans réponse → la demande est transmise au chauffeur suivant.
 *
 * type: "ride" = course de particulier
 * type: "delivery" = livraison food
 */
export interface IncomingDriverRequest {
  type: "ride" | "delivery";
  id: UUID;           /* ride_id ou order_id */
  details: RideRequestDetails | DeliveryRequestDetails;
  countdown: number;  /* Secondes restantes (30 → 0) */
}

/**
 * Détails d'une demande de course.
 */
export interface RideRequestDetails {
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  estimated_price: number; /* FCFA */
  payment_method: string;
}

/**
 * Détails d'une demande de livraison food.
 */
export interface DeliveryRequestDetails {
  restaurant_name: string;
  restaurant_address: string;
  delivery_address: string;
  order_items_count: number;
  order_total: number;     /* FCFA */
  delivery_fee: number;    /* Part revenant au livreur — FCFA */
}

/* ============================================================
 * HISTORIQUE ET REVENUS
 * ============================================================ */

/**
 * Entrée dans l'historique du chauffeur.
 * course ou livraison avec les détails et le montant.
 */
export interface DriverHistoryEntry {
  id: UUID;
  type: "ride" | "delivery";
  date: string;               /* ISO 8601 */
  status: RideStatus | OrderStatus;
  origin?: string;
  destination?: string;
  restaurant_name?: string;   /* Si type = "delivery" */
  earnings: number;           /* FCFA revenu net après commission */
}

/**
 * Détail des revenus par période — retourné par GET /driver/me/earnings.
 */
export interface DriverEarnings {
  total: number;             /* FCFA total de la période */
  rides_earnings: number;    /* Part courses */
  delivery_earnings: number; /* Part livraisons */
  chart: EarningsChartPoint[];
  breakdown: DriverHistoryEntry[];
}

/**
 * Point de données pour le graphique de revenus.
 */
export interface EarningsChartPoint {
  date: string;    /* YYYY-MM-DD */
  amount: number;  /* FCFA */
}

/* ============================================================
 * REQUÊTES
 * ============================================================ */

/**
 * Corps de PUT /driver/me/availability
 */
export interface UpdateAvailabilityRequest {
  is_available: boolean;
}

/**
 * Corps de PUT /driver/me/location — envoyé toutes les 3 secondes.
 * Stocké en Redis avec TTL de 10 secondes (si le chauffeur coupe l'app,
 * la position devient automatiquement stale et est ignorée).
 */
export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
}

/**
 * Corps de PUT /rides/:id/status — mise à jour du statut de course.
 */
export interface UpdateRideStatusRequest {
  status: "en_route" | "arrived" | "in_progress" | "completed";
}

/**
 * Corps de PUT /orders/:id/driver-status — mise à jour de livraison.
 */
export interface UpdateDeliveryStatusRequest {
  status: "picked_up" | "delivered";
}
