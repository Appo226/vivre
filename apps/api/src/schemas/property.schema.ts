/**
 * schemas/property.schema.ts — Schémas Zod pour le module Hébergement
 *
 * Types d'hébergement au Burkina : hôtels classés (Azalaï, Laïco, Splendid),
 * auberges budget, campements ruraux (Nazinga, Tiébélé), locations privées, hostels.
 */

import { z } from "zod";

/* ============================================================
 * RECHERCHE DE PROPRIÉTÉS
 * ============================================================ */

export const PropertySearchSchema = z.object({
  city_id:        z.string().uuid("city_id doit être un UUID"),
  checkin:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkin : format YYYY-MM-DD"),
  checkout:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkout : format YYYY-MM-DD"),
  guests:         z.coerce.number().int().min(1).max(20).default(1),
  property_type:  z.enum(["hotel", "auberge", "campement", "private", "hostel"]).optional(),
  max_price:      z.coerce.number().int().min(0).optional(),     /* FCFA/nuit */
  min_stars:      z.coerce.number().int().min(1).max(5).optional(),
  /* Filtrer par équipements requis : "wifi,piscine,parking" */
  amenities:      z.string().optional(),
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(50).default(20),
});

/* ============================================================
 * LISTE SIMPLE (sans dates — pour la page d'exploration)
 * ============================================================ */

export const PropertiesListSchema = z.object({
  city_id:       z.string().uuid().optional(),
  property_type: z.enum(["hotel", "auberge", "campement", "private", "hostel"]).optional(),
  q:             z.string().max(100).optional(),         /* Recherche textuelle */
  min_stars:     z.coerce.number().int().min(1).max(5).optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(50).default(20),
});

/* ============================================================
 * CRÉATION DE PROPRIÉTÉ (fournisseur)
 * ============================================================ */

export const CreatePropertySchema = z.object({
  city_id:       z.string().uuid(),
  name:          z.string().min(2).max(200),
  property_type: z.enum(["hotel", "auberge", "campement", "private", "hostel"]),
  description:   z.string().min(20).max(5000).optional(),
  address:       z.string().min(5).max(500),
  latitude:      z.number().min(-90).max(90),
  longitude:     z.number().min(-180).max(180),
  phone:         z.string().min(8).max(20),
  email:         z.string().email().optional(),
  star_rating:   z.number().int().min(1).max(5).optional(),
  amenities:     z.array(z.string()).default([]),
  check_in_time:  z.string().regex(/^\d{2}:\d{2}$/).default("14:00"),
  check_out_time: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  cancellation_policy: z.string().max(2000).optional(),
  /* Chambres — au moins 1 type requis pour être utile */
  room_types: z.array(z.object({
    name:           z.string().min(1).max(100),
    description:    z.string().max(1000).optional(),
    max_occupancy:  z.number().int().min(1).max(20),
    bed_type:       z.enum(["single", "double", "twin", "king"]),
    price_per_night: z.number().int().min(0),
    quantity:       z.number().int().min(1),
    amenities:      z.array(z.string()).default([]),
  })).min(1, "Au moins 1 type de chambre requis"),
});

/* ============================================================
 * RÉSERVATION
 * ============================================================ */

export const CreateBookingSchema = z.object({
  property_id:   z.string().uuid(),
  room_type_id:  z.string().uuid(),
  checkin:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkin : format YYYY-MM-DD"),
  checkout:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkout : format YYYY-MM-DD"),
  guests:        z.number().int().min(1).max(20),
  special_requests: z.string().max(1000).optional(),
  promo_code:    z.string().optional(),
});

export type PropertySearchInput = z.infer<typeof PropertySearchSchema>;
export type PropertiesListInput = z.infer<typeof PropertiesListSchema>;
export type CreatePropertyInput = z.infer<typeof CreatePropertySchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
