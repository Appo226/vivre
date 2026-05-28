/**
 * property.ts — Types pour le module Hébergement de VIVRE
 *
 * Couvre tous les types d'hébergement au Burkina Faso :
 * - Hôtels classés (Azalaï, Laïco, Splendid à Ouaga)
 * - Auberges et hôtels budget
 * - Campements ruraux (Nazinga, Tiébélé)
 * - Locations privées type Airbnb
 * - Hostels pour backpackers
 */

import type { UUID, Timestamps } from "./common.js";
import type { PropertyType, BedType, PropertyBookingStatus } from "./enums.js";

/* ============================================================
 * PROPRIÉTÉS
 * ============================================================ */

/**
 * Propriété hébergeant des clients.
 * check_in_time et check_out_time sont au format "HH:MM" (ex: "14:00", "12:00").
 * cancellation_policy est du texte libre pour l'instant — structuré en Phase 2.
 */
export interface Property extends Timestamps {
  id: UUID;
  owner_id: UUID;
  city_id: UUID;
  name: string;
  property_type: PropertyType;
  description?: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  email?: string;
  star_rating?: 1 | 2 | 3 | 4 | 5; /* Classement officiel (optionnel pour les non-classés) */
  amenities: string[];   /* Ex: ["wifi", "piscine", "parking", "restaurant", "climatisation"] */
  check_in_time: string; /* "HH:MM" */
  check_out_time: string;
  cancellation_policy?: string;
  is_approved: boolean;
  is_active: boolean;
  rating_avg: number;
}

/**
 * Type de chambre dans une propriété.
 * quantity = nombre de chambres de ce type (ex: 5 chambres doubles).
 * amenities = équipements spécifiques à ce type (ex: ["bain", "télé satellite"]).
 */
export interface RoomType extends Timestamps {
  id: UUID;
  property_id: UUID;
  name: string;          /* Ex: "Chambre Standard", "Suite Junior", "Chambre VIP" */
  description?: string;
  max_occupancy: number;
  bed_type: BedType;
  price_per_night: number; /* FCFA */
  quantity: number;        /* Nombre de chambres de ce type */
  amenities: string[];
  is_active: boolean;
}

/* ============================================================
 * RÉSERVATIONS
 * ============================================================ */

/**
 * Réservation d'hébergement par un client.
 * nights_count est calculé à la création : (check_out_date - check_in_date) en jours.
 * total_amount = nights_count × price_per_night du room_type.
 */
export interface PropertyBooking extends Timestamps {
  id: UUID;
  user_id: UUID;
  property_id: UUID;
  room_type_id: UUID;
  check_in_date: string;  /* YYYY-MM-DD */
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_amount: number;   /* FCFA */
  special_requests?: string;
  status: PropertyBookingStatus;
  payment_id?: UUID;
  cancelled_at?: string;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête POST /properties/search.
 */
export interface PropertySearchRequest {
  city_id: UUID;
  checkin: string;   /* YYYY-MM-DD */
  checkout: string;
  guests: number;
  type?: PropertyType;
  max_price?: number;    /* FCFA par nuit */
  min_stars?: number;
  amenities?: string[];  /* Filtrer par équipements requis */
}

/**
 * Détail complet d'une propriété — retourné par GET /properties/:id.
 * Inclut les données de chambres, reviews résumés et photos.
 */
export interface PropertyDetail extends Property {
  photos: string[];       /* URLs S3 */
  reviews_count: number;
  room_types?: RoomAvailability[]; /* Présent si checkin/checkout fournis dans la requête */
}

/**
 * Disponibilité d'un type de chambre pour des dates données.
 * quantity_available = nombre de chambres disponibles pour ces dates.
 */
export interface RoomAvailability extends RoomType {
  quantity_available: number; /* 0 = complet pour ces dates */
  photos: string[];
}

/**
 * Corps de la requête POST /property-bookings — réservation d'hôtel.
 */
export interface CreatePropertyBookingRequest {
  property_id: UUID;
  room_type_id: UUID;
  checkin: string;   /* YYYY-MM-DD */
  checkout: string;
  guests: number;
  special_requests?: string;
  promo_code?: string;
}

/**
 * Marqueur de carte pour la vue carte des hôtels.
 * Données minimales pour afficher des pins sur MapLibre sans surcharger la carte.
 */
export interface PropertyMapMarker {
  id: UUID;
  lat: number;
  lng: number;
  price_per_night: number; /* FCFA */
  name: string;
  property_type: PropertyType;
  rating_avg: number;
}
