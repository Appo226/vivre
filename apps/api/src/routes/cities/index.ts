/**
 * routes/cities/index.ts — Module géographie : villes du Burkina Faso
 *
 * Endpoints :
 *   GET  /cities              — Liste des villes actives (avec filtres modules)
 *   GET  /cities/:id          — Détail d'une ville + comptage fournisseurs
 *   POST /cities/detect       — Ville la plus proche d'un point GPS (50km max)
 *   GET  /cities/:id/stats    — Stats d'une ville pour l'écran hub (H-001)
 *
 * Toutes ces routes sont publiques — le hub H-001 affiche la ville
 * courante sans connexion (détection GPS hors-ligne via cache local).
 *
 * Performance : les villes sont peu nombreuses (10) et peu changeantes.
 * En production, le résultat de GET /cities est mis en cache Redis 1h.
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import {
  CitiesQuerySchema,
  DetectCityBodySchema,
} from "../../schemas/geography.schema.js";

export const citiesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /cities — Liste toutes les villes actives
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = CitiesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const q = parseResult.data;

    const cities = await prisma.city.findMany({
      where: {
        is_active: q.is_active !== undefined ? q.is_active === "true" : true,
        ...(q.has_transport === "true" && { has_transport: true }),
        ...(q.has_food === "true" && { has_food: true }),
        ...(q.has_drivers === "true" && { has_drivers: true }),
      },
      select: {
        id: true,
        name: true,
        name_en: true,
        region: true,
        country_code: true,
        latitude: true,
        longitude: true,
        population: true,
        has_transport: true,
        has_food: true,
        has_drivers: true,
        is_active: true,
      },
      /* Ouagadougou d'abord (plus grande ville), puis par population décroissante */
      orderBy: [{ population: "desc" }],
    });

    return reply.send({ cities });
  });

  /* ============================================================
   * POST /cities/detect — Ville la plus proche d'une coordonnée GPS
   *
   * Utilise PostGIS ST_Distance pour trouver la ville dans un rayon de 50km.
   * Retourne null si aucune ville n'est proche (cas : l'utilisateur est hors BF).
   * ============================================================ */
  app.post("/detect", async (request, reply) => {
    const parseResult = DetectCityBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Coordonnées GPS invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { latitude, longitude } = parseResult.data;

    /* Requête PostGIS : trouve la ville active dans un rayon de 50km, triée par distance */
    type CityRow = {
      id: string;
      name: string;
      region: string;
      latitude: number;
      longitude: number;
      has_transport: boolean;
      has_food: boolean;
      has_drivers: boolean;
      distance_m: number;
    };

    const results = await prisma.$queryRaw<CityRow[]>`
      SELECT
        id, name, region, latitude, longitude,
        has_transport, has_food, has_drivers,
        CAST(
          ST_Distance(
            CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography),
            CAST(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS geography)
          ) AS float8
        ) AS distance_m
      FROM cities
      WHERE is_active = true
      HAVING CAST(
        ST_Distance(
          CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography),
          CAST(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS geography)
        ) AS float8
      ) <= 50000
      ORDER BY distance_m ASC
      LIMIT 1
    `;

    if (results.length === 0) {
      return reply.status(404).send({
        error: "Aucune ville VIVRE à moins de 50km de votre position",
        code: "NO_CITY_NEARBY",
      });
    }

    const city = results[0]!;
    return reply.send({
      city: {
        id: city.id,
        name: city.name,
        region: city.region,
        latitude: city.latitude,
        longitude: city.longitude,
        has_transport: city.has_transport,
        has_food: city.has_food,
        has_drivers: city.has_drivers,
      },
      distance_km: Math.round(city.distance_m / 100) / 10,
    });
  });

  /* ============================================================
   * GET /cities/:id — Détail d'une ville
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const city = await prisma.city.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        name_en: true,
        region: true,
        country_code: true,
        latitude: true,
        longitude: true,
        population: true,
        has_transport: true,
        has_food: true,
        has_drivers: true,
        is_active: true,
      },
    });

    if (!city) {
      return reply.status(404).send({ error: "Ville introuvable", code: "CITY_NOT_FOUND" });
    }

    return reply.send({ city });
  });

  /* ============================================================
   * GET /cities/:id/stats — Comptage des entités actives par ville
   * Utilisé par l'écran Hub H-001 pour afficher les badges de count
   * ============================================================ */
  app.get("/:id/stats", async (request, reply) => {
    const { id } = request.params as { id: string };

    /* Comptage parallèle sur 4 tables — plus rapide qu'un seul JOIN */
    const [hotels, restaurants, guides, attractions] = await Promise.all([
      prisma.property.count({ where: { city_id: id, is_active: true } }),
      prisma.restaurant.count({ where: { city_id: id, is_active: true } }),
      prisma.guide.count({ where: { city_id: id, is_active: true } }),
      prisma.attraction.count({ where: { city_id: id, is_active: true } }),
    ]);

    return reply.send({
      city_id: id,
      hotels_count: hotels,
      restaurants_count: restaurants,
      guides_count: guides,
      attractions_count: attractions,
    });
  });
};
