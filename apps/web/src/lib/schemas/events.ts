import { z } from "zod";
import { phoneSchema } from "@vivre/utils";

export const TransferBookingSchema = z.object({
  recipient_phone: phoneSchema,
});

export const EventsQuerySchema = z.object({
  city_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  featured: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const CreateEventSchema = z.object({
  city_id: z.string().uuid(),
  category_id: z.string().uuid(),
  // Catégories additionnelles, en plus de category_id (qui reste la seule à piloter le
  // badge/couleur affichés). Purement pour la découverte — cliquer sur une de ces
  // catégories doit aussi faire apparaître cet événement.
  additional_category_ids: z.array(z.string().uuid()).max(5).default([]),
  title: z.string().min(3).max(200),
  description: z.string().min(20).max(10000),
  venue_name: z.string().min(2).max(200),
  venue_address: z.string().min(5).max(500),
  // Position exacte requise pour tout événement — permet de tracer le lieu sur la carte
  // et donne à l'admin un vrai repère visuel pendant la revue des événements payants.
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  starts_at: z.string().datetime({ message: "starts_at doit être une date ISO 8601" }),
  ends_at: z.string().datetime({ message: "ends_at doit être une date ISO 8601" }),
  max_capacity: z.number().int().min(1).max(100000),
  cover_url: z.string().url().optional(),
  gallery_urls: z.array(z.string().url()).default([]),
  safety_description: z.string().max(5000).optional(),
  expected_profile: z.string().max(500).optional(),
  ticket_types: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        price_fcfa: z.number().int().min(0),
        quantity: z.number().int().min(1),
        max_per_order: z.number().int().min(1).max(100).default(10),
        sale_starts_at: z.string().datetime().optional(),
        sale_ends_at: z.string().datetime().optional(),
        // Merch mandatoire — déjà compris dans price_fcfa, libellés 100% libres pour
        // l'organisateur (VIVRE n'impose aucune structure de bundle).
        included_items: z.array(z.string().min(1).max(80)).max(10).default([]),
        variant_options: z.array(z.string().min(1).max(30)).max(10).default([]),
      })
    )
    .min(1, "Au moins 1 type de billet requis"),
  // Merch optionnel (Pattern B) — catalogue indépendant des types de billets, l'acheteur
  // choisit d'en ajouter ou non à n'importe quel billet. Libellés 100% libres.
  merch_items: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        description: z.string().max(200).optional(),
        price_fcfa: z.number().int().min(0),
        quantity: z.number().int().min(1),
        variant_options: z.array(z.string().min(1).max(30)).max(10).default([]),
      })
    )
    .max(20)
    .default([]),
});

export const CreateBookingSchema = z.object({
  event_id: z.string().uuid(),
  ticket_type_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  promo_code: z.string().min(3).max(30).optional(),
  selected_variant: z.string().max(30).optional(),
  merch_items: z
    .array(
      z.object({
        merch_item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
        variant: z.string().max(30).optional(),
      })
    )
    .max(10)
    .default([]),
});

export const RejectEventSchema = z.object({
  reason: z.string().min(10, "La raison doit être expliquée (min 10 caractères)"),
  // Optionnel — l'admin peut rembourser immédiatement au moment du rejet (ex : contenu
  // clairement contraire aux règles, pas de raison de laisser l'organisateur corriger) plutôt
  // que d'attendre qu'il demande lui-même un remboursement depuis son événement rejeté.
  refund_now: z.boolean().optional(),
});
