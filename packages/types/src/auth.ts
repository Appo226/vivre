/**
 * auth.ts — Types liés à l'authentification et aux utilisateurs VIVRE
 *
 * L'authentification VIVRE est basée sur le numéro de téléphone + OTP SMS.
 * Pas de mot de passe à retenir — design adapté au Burkina Faso où les numéros
 * de téléphone sont l'identifiant principal des individus (Orange +226, Moov +226).
 *
 * Flow d'authentification :
 * 1. POST /auth/send-otp {phone} → SMS avec code 6 chiffres
 * 2. POST /auth/verify-otp {phone, code} → JWT access token + refresh token
 * 3. Headers Authorization: Bearer <token> sur toutes les requêtes protégées
 */

import type { UUID, Timestamps } from "./common.js";
import type { UserRole } from "./enums.js";

/* ============================================================
 * MODÈLES UTILISATEUR
 * ============================================================ */

/**
 * Profil complet d'un utilisateur — données persistées en base.
 */
export interface User extends Timestamps {
  id: UUID;
  phone: string;              /* Format international +226XXXXXXXX */
  email?: string;             /* Optionnel — requis pour les fournisseurs */
  first_name?: string;
  last_name?: string;
  avatar_url?: string;        /* URL S3 de la photo de profil */
  preferred_language: "fr" | "en"; /* Défaut : "fr" (français) */
  is_verified: boolean;       /* true = numéro de téléphone vérifié par OTP */
  is_active: boolean;         /* false = compte bloqué par admin */
  last_login_at?: string;
}

/**
 * Rôle d'un utilisateur — un user peut avoir plusieurs rôles.
 * Ex: propriétaire d'hôtel (supplier) qui est aussi client (customer).
 */
export interface UserRoleEntry {
  id: UUID;
  user_id: UUID;
  role: UserRole;
  is_approved: boolean;  /* Les rôles supplier et driver nécessitent une approbation admin */
  approved_at?: string;
  approved_by?: UUID;    /* ID de l'admin qui a approuvé */
}

/**
 * Profil utilisateur retourné par l'API (sans données sensibles).
 * Ne contient jamais password_hash.
 */
export interface UserProfile {
  id: UUID;
  phone: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  preferred_language: "fr" | "en";
  is_verified: boolean;
  roles: UserRole[];   /* Liste des rôles actifs et approuvés */
  created_at: string;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES AUTH
 * ============================================================ */

/**
 * Corps de la requête POST /auth/send-otp
 */
export interface SendOtpRequest {
  phone: string; /* +226XXXXXXXX — validé par Zod côté serveur */
}

/**
 * Réponse de POST /auth/send-otp
 */
export interface SendOtpResponse {
  message: string;      /* "Code OTP envoyé au +226XXXXXXXX" */
  expires_in: number;   /* Secondes avant expiration (300 = 5 minutes) */
}

/**
 * Corps de la requête POST /auth/verify-otp
 */
export interface VerifyOtpRequest {
  phone: string;
  code: string; /* 6 chiffres */
}

/**
 * Réponse de POST /auth/verify-otp — contient le JWT et le profil.
 * `is_new_user: true` → le frontend redirige vers l'écran de complétion de profil (S-004b).
 */
export interface VerifyOtpResponse {
  token: string;          /* JWT access token (7 jours) */
  refresh_token: string;  /* Refresh token (30 jours) */
  user: UserProfile;
  is_new_user: boolean;   /* true = première connexion → rediriger vers complétion profil */
}

/**
 * Corps de la requête POST /auth/google
 * Google OAuth2 — alternative au OTP pour les utilisateurs avec un compte Google.
 */
export interface GoogleAuthRequest {
  google_token: string; /* Token ID Google OAuth2 */
}

/**
 * Corps de la requête POST /auth/refresh
 */
export interface RefreshTokenRequest {
  refresh_token: string;
}

/**
 * Réponse de POST /auth/refresh
 */
export interface RefreshTokenResponse {
  token: string;
  expires_at: string; /* ISO 8601 */
}

/**
 * Payload du JWT — informations encodées dans le token.
 * Minimaliste pour limiter la taille du header Authorization.
 * Les données complètes sont rechargées depuis la base si nécessaire.
 */
export interface JwtPayload {
  sub: UUID;           /* ID de l'utilisateur (subject standard JWT) */
  phone: string;
  roles: UserRole[];
  iat: number;         /* Issued at (timestamp Unix) */
  exp: number;         /* Expiration (timestamp Unix) */
}

/* ============================================================
 * MISE À JOUR PROFIL
 * ============================================================ */

/**
 * Corps de la requête PUT /users/me
 */
export interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  preferred_language?: "fr" | "en";
  avatar_url?: string;
}

/**
 * Corps de la requête POST /users/me/roles/supplier
 * Déclenchement du processus d'approbation par un admin.
 */
export interface BecomeSupplierRequest {
  supplier_type: "transport" | "hotel" | "restaurant" | "guide";
  business_name: string;
}

/**
 * Corps de la requête POST /users/me/roles/driver
 */
export interface BecomeDriverRequest {
  driver_type: "taxi" | "zemidjan" | "both";
  city_id: UUID;
  vehicle_plate?: string;
}
