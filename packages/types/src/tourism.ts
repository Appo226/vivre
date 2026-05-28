/**
 * tourism.ts — Types pour le module Tourisme, Guides et Attractions de VIVRE
 *
 * Le Burkina Faso possède un patrimoine touristique exceptionnel :
 * - Loropéni : seule inscription UNESCO du pays (ruines préhistoriques)
 * - Tiébélé : maisons peintes des Kasséna (ethnie Gurunsi)
 * - Pics de Sindou : formations rocheuses spectaculaires
 * - Cascades de Karfiguéla : chutes d'eau près de Banfora
 * - Lac de Tengrela : hippos sauvages à 15 min de Banfora
 * - Parc du W, Nazinga, Arly : faune saharienne et soudanaise
 * - FESPACO : plus grand festival de cinéma d'Afrique (Ouagadougou)
 * - SIAO : Salon International de l'Artisanat de l'Afrique de l'Ouest
 *
 * ONTB = Office National du Tourisme du Burkina Faso
 * AGTB = Association des Guides Touristiques du Burkina
 */

import type { UUID, Timestamps } from "./common.js";
import type { AttractionCategory, GuideBookingType, GuideBookingStatus } from "./enums.js";

/* ============================================================
 * ATTRACTIONS
 * ============================================================ */

/**
 * Site ou attraction touristique.
 * description et description_en permettent le contenu bilingue (FR + EN).
 * is_unesco = true → badge spécial "UNESCO" affiché sur la carte et le détail.
 * entry_fee_tourist peut être différent de entry_fee_fcfa (tarif double pour étrangers).
 *
 * opening_hours format JSON :
 * { "mon": "08:00-17:00", "tue": "08:00-17:00", ..., "sun": "closed" }
 * ou { "every_day": "08:00-18:00" } pour les sites en continu.
 */
export interface Attraction extends Timestamps {
  id: UUID;
  city_id?: UUID;            /* null = attraction régionale/nationale sans ville précise */
  name: string;              /* Nom en français */
  name_en?: string;          /* Nom en anglais */
  category: AttractionCategory;
  description: string;
  description_en?: string;
  address?: string;
  latitude: number;
  longitude: number;
  entry_fee_fcfa: number;    /* 0 = entrée gratuite */
  entry_fee_tourist?: number; /* Prix pour les non-résidents (si différent) */
  opening_hours?: Record<string, string>;
  visit_duration_hours?: number; /* Durée recommandée de visite (ex: 2.5 heures) */
  best_season?: string;      /* Ex: "Novembre à Mars (saison sèche)" */
  is_unesco: boolean;
  is_featured: boolean;      /* true = affiché dans la section "À ne pas manquer" */
  is_active: boolean;
  rating_avg: number;
}

/**
 * Événement touristique (FESPACO, SIAO, marchés, festivals).
 * Différent d'une attraction permanente — a une date de début et fin.
 */
export interface TouristEvent {
  id: UUID;
  name: string;
  date_start: string;   /* YYYY-MM-DD */
  date_end: string;
  location: string;     /* Nom du lieu (ex: "Palais des Sports de Ouaga") */
  description?: string;
  attraction_id?: UUID; /* Lié à une attraction si l'événement a lieu dans un site connu */
  city_id: UUID;
}

/* ============================================================
 * GUIDES TOURISTIQUES
 * ============================================================ */

/**
 * Guide touristique certifié.
 * is_ontb_certified = true → certifié par l'Office National du Tourisme du Burkina.
 * Ce badge est crucial pour la confiance des touristes internationaux.
 *
 * zones_covered : UUIDs des villes/régions que le guide peut couvrir.
 * languages : Ex: ["fr", "en", "dioula", "mooré", "de", "es"]
 * specialties : Ex: ["culture", "nature", "gastronomie", "artisanat", "histoire"]
 */
export interface Guide extends Timestamps {
  id: UUID;
  user_id: UUID;           /* Compte utilisateur du guide */
  city_id: UUID;           /* Ville principale du guide */
  bio: string;             /* Présentation du guide (FR) */
  languages: string[];     /* Codes ISO 639-1 (ex: ["fr", "en", "de"]) */
  specialties: string[];
  zones_covered: UUID[];   /* IDs de villes couvertes */
  experience_years?: number;
  daily_rate_fcfa: number;
  half_day_rate_fcfa?: number;
  is_ontb_certified: boolean;
  certification_number?: string; /* Numéro de carte ONTB */
  is_approved: boolean;    /* Approuvé par l'admin VIVRE */
  is_active: boolean;
  rating_avg: number;
}

/**
 * Réservation d'un guide touristique.
 * attraction_ids = sites à visiter (sélection multiple sur l'écran G-003).
 * custom_itinerary = texte libre pour une demande personnalisée.
 */
export interface GuideBooking extends Timestamps {
  id: UUID;
  user_id: UUID;
  guide_id: UUID;
  booking_date: string;       /* YYYY-MM-DD */
  booking_type: GuideBookingType;
  duration_hours?: number;    /* Requis si booking_type = "custom" */
  group_size: number;
  attraction_ids: UUID[];     /* Sites à visiter */
  custom_itinerary?: string;
  total_amount: number;       /* FCFA */
  status: GuideBookingStatus;
  payment_id?: UUID;
  special_requests?: string;
  cancelled_at?: string;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête GET /guides (paramètres de filtre).
 */
export interface GuideSearchParams {
  city_id?: UUID;
  language?: string;      /* Code ISO 639-1 */
  specialty?: string;
  date?: string;          /* YYYY-MM-DD — retourne seulement les guides disponibles */
  max_rate?: number;      /* FCFA — tarif journalier maximum */
  is_ontb_certified?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Profil complet d'un guide — retourné par GET /guides/:id.
 * Inclut les données du compte utilisateur (nom, photo) via JOIN.
 */
export interface GuideProfile extends Guide {
  user: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  photos: string[];        /* Galerie photo (excursions, sites couverts) */
  reviews_count: number;
}

/**
 * Disponibilité d'un guide pour un mois donné.
 * Retourné par GET /guides/:id/availability?month=2026-03.
 */
export interface GuideAvailability {
  available_dates: string[];  /* YYYY-MM-DD */
  booked_dates: string[];
}

/**
 * Corps de la requête POST /guide-bookings.
 */
export interface CreateGuideBookingRequest {
  guide_id: UUID;
  booking_date: string;     /* YYYY-MM-DD */
  booking_type: GuideBookingType;
  duration_hours?: number;
  group_size: number;
  attraction_ids?: UUID[];
  custom_itinerary?: string;
  promo_code?: string;
}

/**
 * Corps de la requête POST /guides/apply — candidature d'un nouveau guide.
 */
export interface GuideApplicationRequest {
  bio: string;
  languages: string[];
  specialties: string[];
  zones_covered: UUID[];
  daily_rate_fcfa: number;
  half_day_rate_fcfa?: number;
  experience_years?: number;
  is_ontb_certified: boolean;
  certification_number?: string;
}
