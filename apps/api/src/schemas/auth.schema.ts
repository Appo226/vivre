/**
 * schemas/auth.schema.ts — Validation Zod des requêtes d'authentification
 *
 * Zod valide les données en entrée (request.body) avant qu'elles n'atteignent
 * la logique métier. En cas d'erreur, Zod lance une ZodError que le error handler
 * global de Fastify transforme en réponse 422 (Unprocessable Entity).
 *
 * Stratégie de validation :
 * - Les numéros de téléphone sont validés ET normalisés (ex: "70 00 00 00" → "+22670000000")
 * - Les codes OTP sont validés comme chaînes numériques de 6 chiffres exactement
 * - Les champs optionnels sont explicitement marqués .optional()
 */

import { z } from "zod";

/* ============================================================
 * REGEX
 * ============================================================ */

/* E.164 international format (+[country][number], 8-16 chars total)
 * OR Burkina local shortcuts: 8 bare digits or 0XXXXXXXX.
 * VIVRE serves both locals and international tourists. */
const PHONE_REGEX = /^(\+[1-9]\d{6,14}|0?\d{8})$/;

/* Exactement 6 chiffres numériques */
const OTP_CODE_REGEX = /^\d{6}$/;

/* ============================================================
 * SCHÉMAS DE REQUÊTE
 * ============================================================ */

/** POST /auth/send-otp */
export const SendOtpBodySchema = z.object({
  phone: z
    .string({ required_error: "Le numéro de téléphone est obligatoire" })
    .trim()
    /* Supprimer les espaces et tirets (ex: "70 12 34 56" → "70123456") */
    .transform((val) => val.replace(/[\s\-().]/g, ""))
    .refine(
      (val) => PHONE_REGEX.test(val),
      "Numéro invalide. Format E.164 international (ex: +15747100846, +22670123456) ou local 8 chiffres"
    ),
});
export type SendOtpBody = z.infer<typeof SendOtpBodySchema>;

/** POST /auth/verify-otp */
export const VerifyOtpBodySchema = z.object({
  phone: z
    .string({ required_error: "Le numéro de téléphone est obligatoire" })
    .trim()
    .transform((val) => val.replace(/[\s\-().]/g, ""))
    .refine(
      (val) => PHONE_REGEX.test(val),
      "Numéro de téléphone invalide"
    ),
  code: z
    .string({ required_error: "Le code OTP est obligatoire" })
    .trim()
    .refine(
      (val) => OTP_CODE_REGEX.test(val),
      "Le code doit être composé de 6 chiffres"
    ),
});
export type VerifyOtpBody = z.infer<typeof VerifyOtpBodySchema>;

/** POST /auth/refresh */
export const RefreshTokenBodySchema = z.object({
  refresh_token: z
    .string({ required_error: "Le refresh token est obligatoire" })
    .min(10, "Refresh token invalide"),
  user_id: z
    .string({ required_error: "L'identifiant utilisateur est obligatoire" })
    .uuid("Identifiant utilisateur invalide"),
});
export type RefreshTokenBody = z.infer<typeof RefreshTokenBodySchema>;

/** PUT /users/me */
export const UpdateProfileBodySchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "Le prénom ne peut pas être vide")
    .max(50, "Prénom trop long (max 50 caractères)")
    .optional(),
  last_name: z
    .string()
    .trim()
    .min(1, "Le nom ne peut pas être vide")
    .max(50, "Nom trop long (max 50 caractères)")
    .optional(),
  email: z
    .string()
    .trim()
    .email("Email invalide")
    .optional()
    .nullable(),
  preferred_language: z
    .enum(["fr", "en"], {
      errorMap: () => ({ message: "Langue supportée : 'fr' ou 'en'" }),
    })
    .optional(),
  avatar_url: z
    .string()
    .url("URL d'avatar invalide")
    .optional()
    .nullable(),
}).strict();
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
