/**
 * common.ts — Types génériques réutilisables dans tout le projet VIVRE
 *
 * Ces types sont les "briques de base" de l'API.
 * Toute réponse paginée, toute erreur, tout filtre géographique
 * utilise ces types — cohérence garantie entre frontend et backend.
 */

/* ============================================================
 * TYPES DE BASE
 * ============================================================ */

/**
 * UUID v4 — Tous les IDs de la base de données sont des UUIDs.
 * Pourquoi UUID et pas auto-increment ?
 * - Sécurité : pas d'énumération possible des ressources (ex: /bookings/1, /bookings/2...)
 * - Scalabilité : pas de conflit si on distribue la génération d'IDs
 * - Portabilité : peut être généré côté client avant même d'être en base
 */
export type UUID = string;

/**
 * Coordonnées GPS — utilisées pour le tri par distance PostGIS et les cartes MapLibre.
 * Toutes les latitudes/longitudes du Burkina Faso sont dans les plages :
 * lat: 9.4 à 15.1, lng: -5.5 à 2.4
 */
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Plage de dates — utilisée pour les recherches hôtelières et la disponibilité des guides.
 * Les dates sont au format ISO 8601 (YYYY-MM-DD) pour éviter les ambiguïtés de timezone.
 */
export interface DateRange {
  from: string; /* YYYY-MM-DD */
  to: string;   /* YYYY-MM-DD */
}

/* ============================================================
 * PAGINATION
 * ============================================================ */

/**
 * Paramètres de pagination — TOUS les endpoints de liste les supportent.
 * Page commence à 1 (pas 0) pour la lisibilité dans l'URL (?page=1&limit=20).
 */
export interface PaginationParams {
  page?: number;  /* Défaut : 1 */
  limit?: number; /* Défaut : 20, max : 100 */
}

/**
 * Métadonnées de pagination dans les réponses.
 * Le frontend utilise `hasNextPage` pour le scroll infini.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;        /* Nombre total de résultats */
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Réponse paginée générique — wraps n'importe quelle liste.
 * Usage: ApiPaginatedResponse<Hotel> pour une liste d'hôtels paginée.
 */
export interface ApiPaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/* ============================================================
 * RÉPONSES API
 * ============================================================ */

/**
 * Réponse API standard pour les succès.
 * Toutes les réponses 200/201 de l'API VIVRE utilisent ce wrapper.
 * Le champ `message` est optionnel — présent uniquement pour les actions (CREATE, UPDATE, DELETE).
 */
export interface ApiResponse<T = void> {
  data?: T;
  message?: string;
}

/**
 * Structure d'erreur API standardisée.
 * `code` est un identifiant machine (ex: "BOOKING_SEATS_UNAVAILABLE")
 * `details` contient des informations contextuelles pour le debugging.
 *
 * Exemple:
 * {
 *   error: "Les sièges sélectionnés ne sont plus disponibles",
 *   code: "TRANSPORT_SEATS_UNAVAILABLE",
 *   details: { unavailable_seats: ["12A", "12B"], available_count: 3 }
 * }
 */
export interface ApiError {
  error: string;       /* Message humain (en français) */
  code: string;        /* Code d'erreur machine en SCREAMING_SNAKE_CASE */
  details?: Record<string, unknown>;
}

/* ============================================================
 * FILTRES GÉOGRAPHIQUES
 * ============================================================ */

/**
 * Filtre de recherche géographique — utilisé par les services publics et restaurants.
 * PostGIS calcule la distance et trie par ST_Distance.
 */
export interface GeoSearchFilter {
  lat?: number;
  lng?: number;
  radius_km?: number; /* Rayon de recherche en km — défaut : 5km pour food, 10km pour services */
  city_id?: UUID;     /* Alternative au filtre GPS — filtrer par ville entière */
}

/* ============================================================
 * TIMESTAMPS
 * ============================================================ */

/**
 * Timestamps présents sur toutes les entités de la base de données.
 * Toutes les tables ont ces 3 champs — convention absolue du projet.
 */
export interface Timestamps {
  created_at: string; /* ISO 8601 */
  updated_at: string; /* ISO 8601 */
  deleted_at?: string; /* null = actif, non-null = soft-deleted */
}

/* ============================================================
 * CITY
 * ============================================================ */

/**
 * Ville de l'application VIVRE.
 * 10 villes cibles initiales au Burkina Faso.
 */
export interface City {
  id: UUID;
  name: string;        /* Nom français (ex: "Ouagadougou") */
  name_en?: string;    /* Nom anglais optionnel */
  region: string;      /* Région administrative */
  country_code: string; /* "BFA" pour Burkina Faso */
  latitude: number;
  longitude: number;
  population?: number;
  is_active: boolean;
  /* Modules activés pour cette ville */
  has_transport: boolean;
  has_food: boolean;
  has_drivers: boolean;
}

/* ============================================================
 * MEDIA
 * ============================================================ */

import type { MediaType } from "./enums.js";

/**
 * Fichier média (photo ou vidéo) associé à une entité.
 * Stocké sur AWS S3, distribué via CloudFront.
 */
export interface Media {
  id: UUID;
  entity_type: string;
  entity_id: UUID;
  url: string;         /* URL S3/CloudFront complète */
  media_type: MediaType;
  is_primary: boolean; /* Seule une photo peut être "primaire" par entité */
  sort_order: number;  /* Ordre d'affichage dans la galerie */
}

/* ============================================================
 * REVIEWS
 * ============================================================ */

import type { ReviewEntityType } from "./enums.js";

/**
 * Évaluation d'une entité (hôtel, restaurant, guide, chauffeur, etc.)
 * Le champ `is_verified` est true uniquement si l'utilisateur a effectivement
 * utilisé le service (booking_ref_id valide) — badge "Avis vérifié".
 */
export interface Review {
  id: UUID;
  user_id: UUID;
  entity_type: ReviewEntityType;
  entity_id: UUID;
  booking_ref_id?: UUID; /* Si présent → avis vérifié (service effectivement utilisé) */
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  comment?: string;
  is_verified: boolean; /* true = client a bien utilisé le service */
  is_visible: boolean;  /* false = masqué par admin suite à signalement */
  response?: string;    /* Réponse du fournisseur à l'avis */
  response_at?: string;
  created_at: string;
}

/**
 * Distribution des notes — utilisée pour l'affichage des étoiles agrégées.
 */
export interface RatingDistribution {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

/**
 * Résumé des avis pour une entité — affiché dans les cards de résultats.
 */
export interface ReviewSummary {
  avg_rating: number;
  total: number;
  distribution: RatingDistribution;
}
