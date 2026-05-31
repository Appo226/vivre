/**
 * schemas/transport.schema.ts — Schemas Zod pour le module Transport Interurbain
 *
 * Ces schemas valident les entrées API pour la recherche de voyages,
 * la création de réservations et l'annulation.
 *
 * Les compagnies de bus au Burkina Faso : TSR, STMB, Rakieta, Sonef, TCV, Rimbo.
 * Corridors principaux : Ouaga ↔ Bobo (300km/4h), Ouaga ↔ Fada (220km/3h).
 */

import { z } from "zod";

/* ============================================================
 * RECHERCHE DE VOYAGES — POST /transport/search
 * Le client envoie : villes origin/destination, date, nb passagers.
 * L'API retourne les trips disponibles avec leurs prix et places.
 * ============================================================ */

export const TransportSearchSchema = z.object({
  origin_city_id: z.string().uuid("origin_city_id doit être un UUID"),
  destination_city_id: z.string().uuid("destination_city_id doit être un UUID"),
  /*
   * Date au format YYYY-MM-DD (ex: "2026-06-15").
   * On valide le format avec une regex légère puis on parse avec Date.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date doit être au format YYYY-MM-DD"),
  /*
   * Nombre de passagers — pour filtrer les voyages avec assez de places libres.
   * Min 1, max 10 (impossible de réserver plus de 10 places en une fois).
   */
  passengers: z.number().int().min(1).max(10).default(1),
});

/* ============================================================
 * CRÉATION DE RÉSERVATION — POST /transport/bookings
 * Les sièges sont bloqués 10 minutes en attente du paiement.
 * ============================================================ */

export const CreateBookingSchema = z.object({
  trip_id: z.string().uuid("trip_id doit être un UUID"),
  /*
   * Numéros de sièges sélectionnés — ex: ["12A", "12B"].
   * Le format est {rangée}{colonne} : rangée = entier, colonne = A/B/C/D.
   * Min 1 siège, max 10 sièges par réservation.
   */
  seat_numbers: z
    .array(z.string().min(2).max(4))
    .min(1, "Au moins 1 siège requis")
    .max(10, "Maximum 10 sièges par réservation"),
  /*
   * Type de passager — détermine le tarif appliqué.
   * "child" et "student" nécessitent présentation de justificatif à l'embarquement.
   */
  passenger_type: z.enum(["adult", "child", "student"], {
    errorMap: () => ({ message: "Type passager invalide : adult | child | student" }),
  }),
  /* Code promo — optionnel, validé côté API (non implémenté en MVP) */
  promo_code: z.string().optional(),
});

/* ============================================================
 * ANNULATION DE RÉSERVATION — DELETE /transport/bookings/:id
 * Raison optionnelle pour la compagnie et les statistiques.
 * ============================================================ */

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

/* ============================================================
 * LISTE DES RÉSERVATIONS — GET /transport/bookings/me
 * Filtres pour afficher seulement les voyages à venir, passés, annulés.
 * ============================================================ */

export const BookingsQuerySchema = z.object({
  /*
   * Filtrer par statut — par défaut tout, "upcoming" pour les réservations futures.
   * "upcoming" = trips avec departure_datetime > maintenant ET status != cancelled.
   */
  filter: z.enum(["all", "upcoming", "completed", "cancelled"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type TransportSearchInput = z.infer<typeof TransportSearchSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
export type BookingsQueryInput = z.infer<typeof BookingsQuerySchema>;
