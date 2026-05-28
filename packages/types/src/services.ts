/**
 * services.ts — Types pour le module Services Publics & Urgences de VIVRE
 *
 * Ce module est l'un des plus critiques pour les Burkinabè.
 * Trouver une pharmacie de garde à 22h à Ouagadougou, ou le numéro de la police
 * en cas d'urgence, doit fonctionner OFFLINE.
 *
 * Numéros d'urgence Burkina Faso :
 * - SAMU (ambulances) : 15
 * - Police nationale : 17
 * - Pompiers : 18
 * - Gendarmerie nationale : 16
 * - Antipoison : +226 25 33 40 40
 *
 * Les données de services publics sont disponibles offline grâce au cache
 * Service Worker de la PWA. Elles sont mises à jour toutes les 24h.
 * Les pharmacies de garde sont recalculées chaque nuit à 00:00 UTC+0.
 */

import type { UUID, Timestamps } from "./common.js";
import type { PublicServiceSlug, CorrectionType, CorrectionStatus, DataSource } from "./enums.js";

/* ============================================================
 * CATÉGORIES DE SERVICES PUBLICS
 * ============================================================ */

/**
 * Catégorie de service public (ex: Hôpital, Pharmacie, Police...).
 * is_emergency = true → affiché en rouge en haut de la liste SP-001.
 * sort_order définit l'ordre dans la grille de l'écran Hub SP-001.
 */
export interface PublicServiceCategory extends Timestamps {
  id: UUID;
  slug: PublicServiceSlug;   /* Identifiant stable (ex: "pharmacy") */
  name_fr: string;           /* Ex: "Pharmacies" */
  name_en: string;           /* Ex: "Pharmacies" */
  icon: string;              /* Nom d'icône Lucide React */
  color_hex: string;         /* Couleur du pictogramme sur la carte */
  is_emergency: boolean;     /* true → mis en évidence sur SP-001 */
  sort_order: number;
  is_active: boolean;
}

/* ============================================================
 * SERVICES PUBLICS
 * ============================================================ */

/**
 * Service public (hôpital, pharmacie, commissariat, mairie, banque...).
 *
 * latitude + longitude sont NOT NULL — un service sans GPS ne peut pas être
 * affiché sur la carte ni trié par distance. C'est une règle métier critique.
 *
 * is_on_duty = pharmacie de garde cette nuit.
 * Calculé par un CRON job PostgreSQL chaque nuit à 00:00.
 * on_duty_until = fin de permanence (souvent le lendemain matin 08:00).
 *
 * opening_hours format :
 * { "mon": "08:00-17:00", "sat": "08:00-12:00", "sun": "closed" }
 * ou null si is_24h = true.
 */
export interface PublicService extends Timestamps {
  id: UUID;
  category_id: UUID;
  city_id: UUID;
  name: string;
  name_en?: string;
  address: string;
  latitude: number;     /* NOT NULL — coordonnées GPS requises */
  longitude: number;
  phone_primary?: string;
  phone_secondary?: string;
  phone_emergency?: string;  /* Ligne directe urgences (pour hôpitaux) */
  opening_hours?: Record<string, string>;
  is_24h: boolean;
  is_open_now: boolean;   /* Calculé en temps réel */
  is_on_duty: boolean;    /* Spécifique aux pharmacies — garde de nuit */
  on_duty_until?: string; /* ISO 8601 — fin de la permanence */
  description?: string;
  description_en?: string;
  website?: string;
  data_source: DataSource;
  last_verified_at?: string;
  is_active: boolean;
}

/**
 * Service public avec distance — retourné par GET /public-services?lat=&lng=.
 * PostGIS calcule la distance (ST_Distance) et trie par proximité.
 */
export interface PublicServiceWithDistance extends PublicService {
  distance_m: number;     /* Distance en mètres (PostGIS ST_Distance) */
  walking_minutes: number; /* Estimation : distance_m / 80 (vitesse marche ~5km/h) */
}

/* ============================================================
 * NUMÉROS D'URGENCE
 * ============================================================ */

/**
 * Numéro d'urgence national.
 * Ces données sont disponibles offline, mises en cache au premier chargement.
 * Les numéros ne changent pratiquement jamais — TTL cache très long (7 jours).
 */
export interface EmergencyNumber extends Timestamps {
  id: UUID;
  country_code: string;   /* "BFA" pour Burkina Faso */
  service_name: string;   /* Ex: "SAMU" */
  service_name_en: string; /* Ex: "Emergency Medical Services" */
  number: string;         /* Ex: "15" ou "+226 25 33 40 40" */
  icon: string;           /* Nom d'icône Lucide React */
  color_hex: string;      /* Défaut: #C8102E (rouge urgence) */
  sort_order: number;
  is_active: boolean;
}

/* ============================================================
 * CORRECTIONS CROWDSOURCÉES
 * ============================================================ */

/**
 * Signalement d'erreur soumis par un utilisateur.
 * user_id peut être null si l'utilisateur n'est pas connecté
 * (on permet les signalements anonymes pour maximiser la participation).
 */
export interface ServiceCorrection extends Timestamps {
  id: UUID;
  service_id: UUID;
  user_id?: UUID;             /* null = signalement anonyme */
  correction_type: CorrectionType;
  description: string;
  status: CorrectionStatus;
  reviewed_by?: UUID;         /* Admin qui a traité le signalement */
  reviewed_at?: string;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête POST /service-corrections.
 * Public — pas besoin d'être connecté pour signaler une erreur.
 */
export interface CreateServiceCorrectionRequest {
  service_id: UUID;
  correction_type: CorrectionType;
  description: string;
}

/**
 * Paramètres de requête GET /public-services.
 */
export interface PublicServiceSearchParams {
  category_id?: UUID;
  lat?: number;
  lng?: number;
  city_id?: UUID;
  is_on_duty?: boolean;  /* true = seulement les pharmacies de garde */
  limit?: number;
}
