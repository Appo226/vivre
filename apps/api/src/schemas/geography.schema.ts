/**
 * schemas/geography.schema.ts — Validation des endpoints géographiques
 *
 * Valide les coordonnées GPS, les IDs de ville et les query params
 * des endpoints cities, public-services et urban-lines.
 *
 * Pourquoi valider les coordonnées GPS ?
 * Des valeurs hors plage (lat > 90, lng > 180) feraient planter PostGIS.
 * Le Burkina Faso est entre lat 9.4–15.1 et lng -5.5–2.4 — on accepte
 * une plage mondiale pour permettre les tests sans bloquer des cas légitimes.
 */

import { z } from "zod";

/* ============================================================
 * COORDONNÉES GPS
 * ============================================================ */

const LatSchema = z.coerce
  .number({ invalid_type_error: "Latitude invalide" })
  .min(-90, "Latitude doit être ≥ -90")
  .max(90, "Latitude doit être ≤ 90");

const LngSchema = z.coerce
  .number({ invalid_type_error: "Longitude invalide" })
  .min(-180, "Longitude doit être ≥ -180")
  .max(180, "Longitude doit être ≤ 180");

/* ============================================================
 * CITIES
 * ============================================================ */

/** GET /cities — query params */
export const CitiesQuerySchema = z.object({
  has_transport: z.enum(["true", "false"]).optional(),
  has_food: z.enum(["true", "false"]).optional(),
  has_drivers: z.enum(["true", "false"]).optional(),
  is_active: z.enum(["true", "false"]).optional(),
});
export type CitiesQuery = z.infer<typeof CitiesQuerySchema>;

/** POST /cities/detect — body */
export const DetectCityBodySchema = z.object({
  latitude: LatSchema,
  longitude: LngSchema,
});
export type DetectCityBody = z.infer<typeof DetectCityBodySchema>;

/* ============================================================
 * PUBLIC SERVICES
 * ============================================================ */

/** GET /public-services — query params */
export const PublicServicesQuerySchema = z.object({
  /* Filtres principaux */
  city_id: z.string().uuid("city_id invalide").optional(),
  category_id: z.string().uuid("category_id invalide").optional(),
  category_slug: z.string().optional(),

  /* Position GPS pour le tri par proximité */
  lat: LatSchema.optional(),
  lng: LngSchema.optional(),

  /* Filtres d'état */
  is_on_duty: z.enum(["true", "false"]).optional(), /* Pharmacies de garde */
  is_open_now: z.enum(["true", "false"]).optional(),

  /* Pagination */
  limit: z.coerce.number().min(1).max(50).default(20),
  page: z.coerce.number().min(1).default(1),
});
export type PublicServicesQuery = z.infer<typeof PublicServicesQuerySchema>;

/** GET /public-services/on-duty — query params */
export const OnDutyQuerySchema = z.object({
  lat: LatSchema.optional(),
  lng: LngSchema.optional(),
  limit: z.coerce.number().min(1).max(10).default(5),
});

/** POST /service-corrections — body */
export const ServiceCorrectionBodySchema = z.object({
  service_id: z.string().uuid("ID de service invalide"),
  correction_type: z.enum([
    "wrong_address",
    "wrong_phone",
    "closed",
    "wrong_hours",
    "other",
  ], {
    errorMap: () => ({
      message: "Type de correction invalide",
    }),
  }),
  description: z
    .string()
    .min(5, "Description trop courte (min 5 caractères)")
    .max(500, "Description trop longue (max 500 caractères)"),
});
export type ServiceCorrectionBody = z.infer<typeof ServiceCorrectionBodySchema>;

/* ============================================================
 * URBAN LINES
 * ============================================================ */

/** GET /urban-lines — query params */
export const UrbanLinesQuerySchema = z.object({
  city_id: z.string().uuid("city_id invalide").optional(),
  is_active: z.enum(["true", "false"]).optional(),
});

/** GET /urban-lines/nearest-stop — query params */
export const NearestStopQuerySchema = z.object({
  lat: LatSchema,
  lng: LngSchema,
  line_id: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(5).default(3),
});
