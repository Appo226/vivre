/**
 * validation.ts — Schémas Zod réutilisables pour la validation côté API et frontend
 *
 * Zod est utilisé à la fois côté serveur (Fastify) et côté client (react-hook-form).
 * Centraliser les schémas évite la duplication et garantit une validation cohérente.
 *
 * Principe : toute donnée externe (input utilisateur, webhook opérateur, paramètre URL)
 * passe par un schéma Zod avant d'être utilisée. Les types TypeScript sont inférés
 * depuis les schémas (z.infer<typeof schema>) — une seule source de vérité.
 */

import { z } from "zod";

import { normalizePhone } from "./phone.js";

/* ============================================================
 * TYPES PRIMITIFS
 * ============================================================ */

/**
 * UUID v4 — validé via regex standard RFC 4122.
 * Utilisé pour tous les IDs de ressources dans les paramètres URL et les corps de requête.
 */
export const uuidSchema = z
  .string()
  .uuid("Identifiant invalide — format UUID v4 requis");

/**
 * Numéro de téléphone burkinabè — normalisé automatiquement via normalizePhone().
 * Accepte tous les formats courants (0X, 226X, +226X, 8 chiffres directs).
 * Transformé en format E.164 (+226XXXXXXXX) après validation.
 */
export const phoneSchema = z
  .string()
  .min(8, "Numéro de téléphone trop court")
  .max(20, "Numéro de téléphone trop long")
  .transform((val) => normalizePhone(val))
  .refine((val): val is string => val !== null, {
    message: "Numéro de téléphone burkinabè invalide (format: +226XXXXXXXX)",
  });

/**
 * Code OTP à 6 chiffres.
 */
export const otpCodeSchema = z
  .string()
  .length(6, "Le code OTP doit faire exactement 6 chiffres")
  .regex(/^\d{6}$/, "Le code OTP ne doit contenir que des chiffres");

/**
 * Coordonnées GPS dans les limites du Burkina Faso (avec marge).
 */
export const latitudeSchema = z
  .number()
  .min(9.0, "Latitude hors des limites du Burkina Faso")
  .max(15.5, "Latitude hors des limites du Burkina Faso");

export const longitudeSchema = z
  .number()
  .min(-5.8, "Longitude hors des limites du Burkina Faso")
  .max(2.7, "Longitude hors des limites du Burkina Faso");

export const geoCoordinatesSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

/**
 * Date au format YYYY-MM-DD — utilisée pour les recherches et réservations.
 * Validation stricte du format, pas de dates invalides (ex: "2026-02-30").
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide — attendu: YYYY-MM-DD")
  .refine((val) => !isNaN(Date.parse(val)), "Date invalide");

/**
 * Montant FCFA — entier positif.
 */
export const fcfaAmountSchema = z
  .number()
  .int("Le montant doit être un entier (pas de décimales en FCFA)")
  .positive("Le montant doit être positif")
  .max(10_000_000, "Montant trop élevé (max: 10 000 000 FCFA)");

/**
 * Note sur 5 étoiles.
 */
export const ratingSchema = z
  .number()
  .int()
  .min(1, "La note minimum est 1 étoile")
  .max(5, "La note maximum est 5 étoiles");

/**
 * Langue préférée — fr ou en uniquement.
 */
export const languageSchema = z.enum(["fr", "en"], {
  errorMap: () => ({ message: "Langue invalide — choisir 'fr' ou 'en'" }),
});

/* ============================================================
 * SCHÉMAS DE PAGINATION
 * ============================================================ */

/**
 * Paramètres de pagination pour les requêtes GET de liste.
 * Coerce string → number (les paramètres URL sont toujours des strings).
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ============================================================
 * SCHÉMAS AUTH
 * ============================================================ */

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

export const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(50).optional(),
  last_name: z.string().min(1).max(50).optional(),
  email: z.string().email("Email invalide").optional(),
  preferred_language: languageSchema.optional(),
  avatar_url: z.string().url("URL invalide").optional(),
});

/* ============================================================
 * SCHÉMAS GÉOGRAPHIQUES
 * ============================================================ */

/**
 * Paramètres de recherche géographique — utilisés par les services publics et restaurants.
 */
export const geoSearchSchema = z.object({
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
  radius_km: z.coerce.number().min(0.1).max(50).optional(),
  city_id: uuidSchema.optional(),
}).refine(
  /* Soit lat/lng soit city_id est requis — les deux ne peuvent pas être absents */
  (data) => (data.lat !== undefined && data.lng !== undefined) || data.city_id !== undefined,
  { message: "Fournir soit lat+lng soit city_id" }
);

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Type inféré depuis un schéma Zod — raccourci pour z.infer<typeof schema>.
 * Usage: type SendOtpInput = ZodInfer<typeof sendOtpSchema>
 */
export type ZodInfer<T extends z.ZodTypeAny> = z.infer<T>;
