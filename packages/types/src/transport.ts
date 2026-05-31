/**
 * transport.ts — Types pour les modules Transport Interurbain et Intraurbain
 *
 * Transport Interurbain : Bus longue distance (TSR, STMB, Rakieta, Sonef, TCV, Rimbo...)
 * Corridors prioritaires : Ouaga↔Bobo (300km), Ouaga↔Fada, Ouaga↔Ouahigouya, etc.
 *
 * Transport Intraurbain : Taxis, Zémidjans (moto-taxis), SOTRACO (bus urbains)
 * Les zémidjans font aussi la livraison food — réseau de chauffeurs partagé.
 */

import type { UUID, Timestamps } from "./common.js";
import type {
  BusType,
  PassengerType,
  TripStatus,
  BookingStatus,
  DriverType,
  RideType,
  RideStatus,
  RidePaymentMethod,
} from "./enums.js";

/* ============================================================
 * TRANSPORT INTERURBAIN
 * ============================================================ */

/**
 * Compagnie de transport interurbain.
 * Les principales compagnies du Burkina : TSR, STMB, Rakieta, Sonef, TCV, Rimbo.
 * Le supplier_type "transport" permet aux compagnies de s'enregistrer elles-mêmes.
 */
export interface TransportCompany extends Timestamps {
  id: UUID;
  owner_id: UUID;          /* Compte utilisateur du gestionnaire */
  name: string;            /* Ex: "TSR - Transport Sahel Relais" */
  logo_url?: string;
  phone: string;
  email?: string;
  address: string;         /* Adresse de la gare routière */
  city_id: UUID;
  license_number?: string;
  is_approved: boolean;    /* true = validé par admin VIVRE */
  is_active: boolean;
  rating_avg: number;
  total_reviews: number;
}

/**
 * Ligne de bus interurbain — itinéraire fixe entre deux villes.
 * distance_km et duration_minutes sont calculés une fois et mis en cache.
 */
export interface Route extends Timestamps {
  id: UUID;
  company_id: UUID;
  origin_city_id: UUID;
  destination_city_id: UUID;
  distance_km: number;
  duration_minutes: number;
  bus_type: BusType;
  total_seats: number;  /* Capacité totale — varie selon le bus_type */
  is_active: boolean;
}

/**
 * Planning d'une ligne — jours et heures de départ récurrents.
 * days_of_week: tableau d'entiers 1-7 (1=Lundi, 7=Dimanche).
 * Ex: [1,3,5] = Lundi, Mercredi, Vendredi.
 */
export interface Schedule extends Timestamps {
  id: UUID;
  route_id: UUID;
  departure_time: string;  /* HH:MM (ex: "07:00") */
  arrival_time: string;
  days_of_week: number[];
  base_price: number;      /* Prix adulte en FCFA */
  child_price: number;     /* Prix enfant (généralement -30%) */
  student_price: number;   /* Prix étudiant */
  is_active: boolean;
}

/**
 * Voyage concret — instance d'un schedule à une date précise.
 * available_seats est décrémenté à chaque réservation confirmée (trigger PostgreSQL).
 */
export interface Trip extends Timestamps {
  id: UUID;
  schedule_id: UUID;
  route_id: UUID;
  departure_datetime: string; /* ISO 8601 avec timezone (Africa/Ouagadougou) */
  arrival_datetime: string;
  available_seats: number;
  status: TripStatus;
  override_price?: number;    /* Remplace le prix du schedule (promotions, jours fériés) */
}

/**
 * Résultat de recherche de voyage — retourné par POST /transport/search.
 * Combine les données de Trip, Route, et Company pour afficher une card de résultat.
 */
export interface TripSearchResult {
  id: UUID; /* trip_id */
  company: {
    id: UUID;
    name: string;
    logo_url?: string;
    rating_avg: number;
  };
  route: {
    origin_city: string;
    destination_city: string;
    distance_km: number;
    bus_type: BusType;
  };
  departure_datetime: string;
  arrival_datetime: string;
  duration_minutes: number;
  available_seats: number;
  prices: {
    adult: number;
    child: number;
    student: number;
  };
  status: TripStatus;
}

/**
 * Plan de siège d'un bus — retourné par GET /transport/trips/:id/seats.
 * rows et cols définissent la grille visuelle (ex: 10 rangées × 4 cols pour un 40 places).
 */
export interface SeatMap {
  seats: SeatInfo[];
  layout: {
    rows: number;
    cols: number;
    aisle_after_col?: number; /* Numéro de colonne après lequel il y a l'allée centrale */
  };
}

/**
 * Informations sur un siège individuel.
 */
export interface SeatInfo {
  number: string;               /* Ex: "12A", "12B" */
  status: "available" | "occupied" | "selected";
  row: number;
  col: number;
}

/**
 * Réservation de bus — ticket acheté par un client.
 * qr_code contient les données pour générer le QR code sur le billet PDF.
 */
export interface TransportBooking extends Timestamps {
  id: UUID;
  user_id: UUID;
  trip_id: UUID;
  passenger_count: number;
  seat_numbers: string[];      /* Ex: ["12A", "12B"] */
  passenger_type: PassengerType;
  total_amount: number;        /* FCFA */
  status: BookingStatus;
  payment_id?: UUID;
  qr_code: string;             /* Données QR (ex: JSON encodé base64) */
  cancelled_at?: string;
  cancellation_reason?: string;
}

/**
 * Corps de la requête POST /transport/bookings.
 * Le siège est réservé pour 10 minutes en attente du paiement.
 */
export interface CreateTransportBookingRequest {
  trip_id: UUID;
  seat_numbers: string[];
  passenger_type: PassengerType;
  promo_code?: string;
}

/**
 * Corps de la requête POST /transport/search.
 */
export interface TransportSearchRequest {
  origin_city_id: UUID;
  destination_city_id: UUID;
  date: string;        /* YYYY-MM-DD */
  passengers: number;  /* Pour filtrer les voyages avec assez de places */
}

/* ============================================================
 * TRANSPORT INTRAURBAIN
 * ============================================================ */

/**
 * Chauffeur intraurbain (taxi ou zémidjan).
 * current_lat/current_lng sont mis à jour toutes les 3 secondes via WebSocket.
 * can_deliver_food = true → ce chauffeur est aussi livreur dans le module food.
 */
export interface Driver extends Timestamps {
  id: UUID;
  user_id: UUID;
  city_id: UUID;
  driver_type: DriverType;
  vehicle_type?: string;     /* Ex: "Moto Honda CG 125" */
  vehicle_plate?: string;
  license_number?: string;
  is_available: boolean;     /* Toggle par le chauffeur — disponible ou non */
  current_lat?: number;
  current_lng?: number;
  last_location_at?: string;
  can_deliver_food: boolean;
  base_rate_fcfa: number;    /* Tarif de base par km — négocié avec VIVRE */
  rating_avg: number;
  is_approved: boolean;
}

/**
 * Position anonymisée d'un chauffeur disponible.
 * Retourné par GET /drivers/available — sans données personnelles.
 * (On n'expose pas le nom/téléphone du chauffeur avant acceptation de la course.)
 */
export interface AvailableDriverLocation {
  id: UUID;
  driver_type: DriverType;
  latitude: number;
  longitude: number;
  vehicle_type?: string;
  rating_avg: number;
}

/**
 * Demande de course créée par un client.
 */
export interface RideRequest extends Timestamps {
  id: UUID;
  user_id: UUID;
  driver_id?: UUID;          /* null = en cours de recherche */
  city_id: UUID;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address?: string;
  ride_type: RideType;
  estimated_price: number;   /* FCFA — calculé à la création */
  final_price?: number;      /* Mis à jour à la fin de la course */
  status: RideStatus;
  payment_method: RidePaymentMethod;
  payment_id?: UUID;
  requested_at: string;
  accepted_at?: string;
  completed_at?: string;
  cancelled_at?: string;
}

/**
 * Corps de la requête POST /rides — demande de course.
 */
export interface CreateRideRequest {
  ride_type: RideType;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address?: string;
  payment_method: RidePaymentMethod;
}

/**
 * Estimation de prix avant commande — retourné par GET /rides/estimate.
 */
export interface RideEstimate {
  estimated_price: number;  /* FCFA */
  distance_km: number;
  duration_minutes: number;
}

/**
 * Ligne de bus urbain SOTRACO (ou autre opérateur).
 * Les données SOTRACO sont statiques et disponibles offline.
 */
export interface UrbanLine extends Timestamps {
  id: UUID;
  city_id: UUID;
  operator_name: string;  /* Ex: "SOTRACO" */
  line_number: string;    /* Ex: "L01", "L12" */
  line_name: string;      /* Ex: "Ouaga 2000 — Dassasgho" */
  color_hex: string;      /* Couleur d'identification sur la carte */
  fare_fcfa: number;      /* Tarif unique sur la ligne */
  frequency_minutes: number; /* Fréquence de passage en minutes */
  is_active: boolean;
}

/**
 * Arrêt de bus urbain sur une ligne SOTRACO.
 * sequence_order définit l'ordre des arrêts sur la ligne.
 */
export interface UrbanStop {
  id: UUID;
  line_id: UUID;
  name: string;
  sequence_order: number;
  latitude: number;
  longitude: number;
}

/**
 * Réponse WebSocket pour le suivi de course en temps réel.
 * Émis par le serveur toutes les 3 secondes tant que la course est en cours.
 */
export interface RideTrackingUpdate {
  driver_lat: number;
  driver_lng: number;
  status: RideStatus;
  estimated_minutes: number;
}
