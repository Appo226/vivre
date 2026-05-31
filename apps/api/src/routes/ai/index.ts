/**
 * routes/ai/index.ts — Assistant IA VIVRE (Module 10)
 *
 * POST /ai/chat — Boucle agentique avec Claude Sonnet
 *
 * 7 outils disponibles :
 *   get_cities            — liste des villes actives
 *   search_restaurants    — recherche restaurants
 *   search_properties     — recherche hébergements
 *   search_transport      — trajets interurbains
 *   get_emergency_numbers — services d'urgence
 *   estimate_ride         — estimation prix taxi/zémidjan
 *   search_events         — événements à venir
 *
 * Boucle max 5 tours : Claude appelle les outils, on exécute,
 * on réinjecte les résultats jusqu'à stop_reason === "end_turn".
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { estimatePrice, DEFAULT_RATES } from "../../utils/pricing.js";

/* ============================================================
 * CLIENT ANTHROPIC
 * ============================================================ */

const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

const MODEL = "claude-sonnet-4-6";
const MAX_ROUNDS = 5;

/* ============================================================
 * SYSTEM PROMPT
 * ============================================================ */

const SYSTEM_PROMPT = `Tu es l'assistant IA de VIVRE, la super-app de mobilité et de services au Burkina Faso.

Tu peux aider les utilisateurs à :
- Trouver des restaurants, maquis, boulangeries dans leur ville
- Chercher des hôtels, auberges et hébergements
- Trouver des trajets de bus ou minibus entre villes
- Estimer le prix d'une course taxi ou zémidjan (moto-taxi)
- Découvrir des événements culturels, concerts, festivals
- Obtenir les numéros d'urgence (SAMU, police, pompiers, hôpitaux)
- Explorer les attractions touristiques (sites UNESCO, parcs naturels, patrimoine culturel)

Directives :
- Réponds toujours en français, sauf si l'utilisateur parle une autre langue
- Les prix sont en FCFA (Franc CFA West-Africain)
- Sois concis, chaleureux et pratique
- Utilise les outils pour répondre avec des données réelles — ne confabule jamais de noms, prix ou numéros de téléphone
- Quand tu listes des résultats, formate-les de manière lisible (nom, infos clés, prix si disponible)
- Pour les courses, rappelle que seuls Orange Money, Moov Money et Telecel Money sont acceptés (pas de cash)`;

/* ============================================================
 * DÉFINITION DES OUTILS
 * ============================================================ */

const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_cities",
    description: "Récupère la liste de toutes les villes disponibles dans VIVRE avec leurs IDs.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_restaurants",
    description:
      "Recherche des restaurants, maquis, fast-foods ou boulangeries dans une ville. Retourne jusqu'à 10 résultats.",
    input_schema: {
      type: "object" as const,
      properties: {
        city_id: { type: "string", description: "ID de la ville (obligatoire)" },
        query: {
          type: "string",
          description: "Terme de recherche dans le nom ou la description",
        },
        restaurant_type: {
          type: "string",
          enum: ["restaurant", "maquis", "fastfood", "bakery", "street_food"],
          description: "Filtrer par type",
        },
      },
      required: ["city_id"],
    },
  },
  {
    name: "search_properties",
    description:
      "Recherche des hébergements (hôtels, auberges, campements) dans une ville. Retourne jusqu'à 10 résultats.",
    input_schema: {
      type: "object" as const,
      properties: {
        city_id: { type: "string", description: "ID de la ville (obligatoire)" },
        property_type: {
          type: "string",
          enum: ["hotel", "auberge", "campement", "private", "hostel"],
          description: "Filtrer par type d'hébergement",
        },
        min_stars: {
          type: "number",
          description: "Nombre minimum d'étoiles (1-5)",
        },
      },
      required: ["city_id"],
    },
  },
  {
    name: "search_transport",
    description:
      "Recherche des trajets de transport interurbain (bus, minibus) entre deux villes. Retourne les trajets disponibles.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_city_id: { type: "string", description: "ID de la ville de départ" },
        to_city_id: {
          type: "string",
          description: "ID de la ville d'arrivée (optionnel — si omis, retourne toutes les destinations depuis la ville de départ)",
        },
      },
      required: ["from_city_id"],
    },
  },
  {
    name: "get_emergency_numbers",
    description:
      "Récupère les services d'urgence (hôpitaux, pharmacies de garde, police, pompiers) d'une ville.",
    input_schema: {
      type: "object" as const,
      properties: {
        city_id: {
          type: "string",
          description: "ID de la ville (optionnel — si omis, retourne les services nationaux)",
        },
      },
      required: [],
    },
  },
  {
    name: "estimate_ride",
    description:
      "Estime le prix d'une course taxi ou zémidjan (moto-taxi) entre deux points GPS, en tenant compte des tarifs locaux.",
    input_schema: {
      type: "object" as const,
      properties: {
        pickup_lat: { type: "number", description: "Latitude du point de départ" },
        pickup_lng: { type: "number", description: "Longitude du point de départ" },
        dropoff_lat: { type: "number", description: "Latitude de la destination" },
        dropoff_lng: { type: "number", description: "Longitude de la destination" },
        ride_type: {
          type: "string",
          enum: ["taxi", "zemidjan"],
          description: "Type de véhicule (taxi = voiture, zemidjan = moto-taxi)",
        },
        city_id: {
          type: "string",
          description: "ID de la ville pour appliquer les tarifs locaux (optionnel)",
        },
      },
      required: ["pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "ride_type"],
    },
  },
  {
    name: "search_events",
    description:
      "Recherche les événements à venir (concerts, festivals, expositions, conférences) dans une ville.",
    input_schema: {
      type: "object" as const,
      properties: {
        city_id: { type: "string", description: "ID de la ville (optionnel)" },
        query: { type: "string", description: "Terme de recherche dans le titre ou le lieu" },
      },
      required: [],
    },
  },
  {
    name: "search_attractions",
    description:
      "Recherche les attractions touristiques (sites naturels, patrimoine, culture, urban) au Burkina Faso.",
    input_schema: {
      type: "object" as const,
      properties: {
        city_id: { type: "string", description: "ID de la ville (optionnel)" },
        category: {
          type: "string",
          enum: ["nature", "culture", "heritage", "event", "urban"],
          description: "Catégorie de l'attraction",
        },
        featured: {
          type: "boolean",
          description: "Si true, retourne uniquement les attractions mises en avant",
        },
      },
      required: [],
    },
  },
];

/* ============================================================
 * EXÉCUTION DES OUTILS
 * ============================================================ */

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "get_cities": {
      const cities = await prisma.city.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(cities);
    }

    case "search_restaurants": {
      const city_id = input["city_id"] as string;
      const query = input["query"] as string | undefined;
      const restaurant_type = input["restaurant_type"] as string | undefined;

      const restaurants = await prisma.restaurant.findMany({
        where: {
          city_id,
          is_approved: true,
          is_active: true,
          deleted_at: null,
          ...(restaurant_type ? { restaurant_type } : {}),
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { description: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          restaurant_type: true,
          description: true,
          address: true,
          rating_avg: true,
          min_order_fcfa: true,
          is_open_now: true,
          phone: true,
        },
        take: 10,
        orderBy: { rating_avg: "desc" },
      });
      return JSON.stringify(restaurants);
    }

    case "search_properties": {
      const city_id = input["city_id"] as string;
      const property_type = input["property_type"] as string | undefined;
      const min_stars = input["min_stars"] as number | undefined;

      const properties = await prisma.property.findMany({
        where: {
          city_id,
          is_approved: true,
          is_active: true,
          ...(property_type ? { property_type } : {}),
          ...(min_stars !== undefined ? { star_rating: { gte: min_stars } } : {}),
        },
        select: {
          id: true,
          name: true,
          property_type: true,
          star_rating: true,
          rating_avg: true,
          address: true,
          amenities: true,
          check_in_time: true,
          check_out_time: true,
          phone: true,
        },
        take: 10,
        orderBy: { rating_avg: "desc" },
      });
      return JSON.stringify(properties);
    }

    case "search_transport": {
      const from_city_id = input["from_city_id"] as string;
      const to_city_id = input["to_city_id"] as string | undefined;

      const routes = await prisma.route.findMany({
        where: {
          origin_city_id: from_city_id,
          is_active: true,
          deleted_at: null,
          ...(to_city_id ? { destination_city_id: to_city_id } : {}),
        },
        select: {
          id: true,
          distance_km: true,
          duration_minutes: true,
          bus_type: true,
          origin_city: { select: { name: true } },
          destination_city: { select: { name: true } },
          company: { select: { name: true, phone: true } },
          schedules: {
            where: { is_active: true as const },
            select: {
              departure_time: true,
              arrival_time: true,
              days_of_week: true,
              base_price: true,
              child_price: true,
            },
            take: 5,
          },
        },
        take: 10,
      });
      return JSON.stringify(routes);
    }

    case "get_emergency_numbers": {
      const city_id = input["city_id"] as string | undefined;

      const services = await prisma.publicService.findMany({
        where: {
          is_active: true,
          ...(city_id ? { city_id } : {}),
          category: { is_emergency: true },
        },
        select: {
          id: true,
          name: true,
          address: true,
          phone_primary: true,
          phone_secondary: true,
          phone_emergency: true,
          is_24h: true,
          is_open_now: true,
          category: { select: { slug: true, name_fr: true } },
        },
        take: 20,
        orderBy: { category: { sort_order: "asc" } },
      });
      return JSON.stringify(services);
    }

    case "estimate_ride": {
      const pickup_lat = input["pickup_lat"] as number;
      const pickup_lng = input["pickup_lng"] as number;
      const dropoff_lat = input["dropoff_lat"] as number;
      const dropoff_lng = input["dropoff_lng"] as number;
      const ride_type = input["ride_type"] as string;
      const city_id = input["city_id"] as string | undefined;

      const [cityRates, cityRules] = city_id
        ? await Promise.all([
            prisma.city.findUnique({
              where: { id: city_id },
              select: {
                taxi_rate_per_km: true,
                zemidjan_rate_per_km: true,
                min_fare: true,
                night_rate_multiplier: true,
              },
            }),
            prisma.cityPricingRule.findMany({
              where: { city_id, is_active: true },
              select: {
                taxi_multiplier: true,
                zemidjan_multiplier: true,
                months: true,
                weekdays: true,
                hour_start: true,
                hour_end: true,
                date_from: true,
                date_to: true,
              },
            }),
          ])
        : [null, []];

      const rates = cityRates ?? DEFAULT_RATES;
      const price = estimatePrice(
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        ride_type,
        rates,
        cityRules,
        new Date()
      );

      return JSON.stringify({
        ride_type,
        estimated_price_fcfa: price,
        currency: "FCFA",
        payment_methods: ["orange_money", "moov_money", "telecel_money"],
        note: "Prix estimé. Le tarif final peut varier légèrement selon le trajet réel.",
      });
    }

    case "search_events": {
      const city_id = input["city_id"] as string | undefined;
      const query = input["query"] as string | undefined;

      const events = await prisma.event.findMany({
        where: {
          status: "approved",
          starts_at: { gte: new Date() },
          ...(city_id ? { city_id } : {}),
          ...(query
            ? {
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { venue_name: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          venue_name: true,
          venue_address: true,
          starts_at: true,
          ends_at: true,
          cover_url: true,
          city: { select: { name: true } },
        },
        take: 10,
        orderBy: { starts_at: "asc" },
      });
      return JSON.stringify(events);
    }

    case "search_attractions": {
      const city_id  = input["city_id"]  as string | undefined;
      const category = input["category"] as string | undefined;
      const featured = input["featured"] as boolean | undefined;

      const attractions = await prisma.attraction.findMany({
        where: {
          is_active: true,
          ...(city_id   ? { city_id }                    : {}),
          ...(category  ? { category }                   : {}),
          ...(featured !== undefined ? { is_featured: featured } : {}),
        },
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          address: true,
          entry_fee_fcfa: true,
          visit_duration_hours: true,
          best_season: true,
          is_unesco: true,
          is_featured: true,
          rating_avg: true,
          city: { select: { name: true } },
        },
        orderBy: [{ is_featured: "desc" }, { rating_avg: "desc" }],
        take: 10,
      });
      return JSON.stringify(attractions);
    }

    default:
      return JSON.stringify({ error: `Outil inconnu : ${name}` });
  }
}

/* ============================================================
 * SCHÉMA DE VALIDATION
 * ============================================================ */

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(50),
  city_id: z.string().optional(),
});

/* ============================================================
 * ROUTE
 * ============================================================ */

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/chat",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      await authenticate(request, reply);

      const body = chatBodySchema.parse(request.body);

      /* Contexte ville injecté dans le system prompt si fourni */
      let systemPrompt = SYSTEM_PROMPT;
      if (body.city_id) {
        systemPrompt += `\n\nVille actuelle de l'utilisateur : ID = ${body.city_id}. Utilise cet ID en priorité quand l'utilisateur parle de "ici" ou "ma ville".`;
      }

      /* Construire l'historique pour l'API Anthropic */
      const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      /* Boucle agentique */
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          tools: AI_TOOLS,
          messages,
        });

        /* Pas d'appel d'outil → réponse finale */
        if (
          response.stop_reason === "end_turn" ||
          !response.content.some((b) => b.type === "tool_use")
        ) {
          const textBlock = response.content.find((b) => b.type === "text");
          return reply.send({
            role: "assistant",
            content: textBlock && textBlock.type === "text"
              ? textBlock.text
              : "Je n'ai pas pu générer une réponse. Veuillez réessayer.",
          });
        }

        /* Ajouter la réponse assistant à l'historique */
        messages.push({ role: "assistant", content: response.content });

        /* Exécuter chaque outil appelé */
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            app.log.info({ tool: block.name, input: block.input }, "AI tool call");
            let result: string;
            try {
              result = await executeTool(block.name, block.input as Record<string, unknown>);
            } catch (err) {
              result = JSON.stringify({ error: "Erreur lors de l'exécution de l'outil", details: String(err) });
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        /* Réinjecter les résultats comme message utilisateur */
        messages.push({ role: "user", content: toolResults });
      }

      /* Max rounds atteint — retourner un message d'excuse */
      return reply.send({
        role: "assistant",
        content:
          "Je suis désolé, votre demande nécessite trop d'étapes pour être traitée. Pouvez-vous la reformuler ?",
      });
    }
  );
};
