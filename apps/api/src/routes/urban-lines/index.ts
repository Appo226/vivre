/**
 * routes/urban-lines/index.ts — Lignes de bus urbain (SOTRACO Ouagadougou)
 *
 * Endpoints :
 *   GET /urban-lines                 — Toutes les lignes actives (optionnel : filtrer par ville)
 *   GET /urban-lines/:id             — Détail d'une ligne + ses arrêts ordonnés
 *   GET /urban-lines/:id/stops       — Arrêts d'une ligne ordonnés par sequence_order
 *   GET /urban-lines/nearest-stop    — Arrêt le plus proche d'une coordonnée GPS
 *
 * Schéma Prisma (Étape 2) :
 *   UrbanLine  → urban_lines  (line_number, line_name, operator_name, fare_fcfa, frequency_minutes)
 *   UrbanStop  → urban_stops  (line_id FK, name, sequence_order, latitude, longitude)
 *   Pas de table pivot — chaque arrêt appartient à une seule ligne via line_id.
 *
 * PostGIS pour nearest-stop :
 *   ST_Distance sur latitude/longitude de urban_stops — l'index GIST accélère la recherche.
 *
 * Mode hors-ligne :
 *   Les lignes et leurs arrêts sont cachés côté client 24h.
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { Prisma } from "@prisma/client";
import {
  UrbanLinesQuerySchema,
  NearestStopQuerySchema,
} from "../../schemas/geography.schema.js";

/* ============================================================
 * TYPE pour les résultats PostGIS de nearest-stop
 * ============================================================ */

type StopWithDistance = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  line_id: string;
  line_number: string;
  line_name: string;
  color_hex: string;
};

export const urbanLinesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /urban-lines/nearest-stop — Arrêt le plus proche (PostGIS)
   * IMPORTANT : déclarée avant /:id pour éviter que Fastify matche
   * "nearest-stop" comme un paramètre de route dynamique.
   * ============================================================ */
  app.get("/nearest-stop", async (request, reply) => {
    const parseResult = NearestStopQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Coordonnées GPS invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { lat, lng, line_id, limit } = parseResult.data;

    /*
     * Requête PostGIS : trouve les arrêts les plus proches du point GPS.
     * UrbanStop.line_id est une FK directe sur UrbanLine (pas de table pivot).
     * Si line_id est fourni, restreint aux arrêts de cette ligne.
     * Prisma.sql assure que les valeurs sont paramétrées (pas d'injection SQL).
     */
    const lineFilter = line_id
      ? Prisma.sql`AND ul.id = ${line_id}::uuid`
      : Prisma.sql``;

    const results = await prisma.$queryRaw<StopWithDistance[]>`
      SELECT
        us.id,
        us.name,
        us.latitude,
        us.longitude,
        ul.id          AS line_id,
        ul.line_number,
        ul.line_name,
        ul.color_hex,
        CAST(
          ST_Distance(
            CAST(ST_SetSRID(ST_MakePoint(us.longitude, us.latitude), 4326) AS geography),
            CAST(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geography)
          ) AS float8
        ) AS distance_m
      FROM urban_stops us
      JOIN urban_lines ul ON ul.id = us.line_id
      WHERE ul.is_active = true
        ${lineFilter}
      ORDER BY distance_m ASC
      LIMIT ${limit}
    `;

    return reply.send({ stops: results });
  });

  /* ============================================================
   * GET /urban-lines — Toutes les lignes actives
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = UrbanLinesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, is_active } = parseResult.data;

    const lines = await prisma.urbanLine.findMany({
      where: {
        is_active: is_active !== undefined ? is_active === "true" : true,
        ...(city_id && { city_id }),
      },
      select: {
        id: true,
        line_number: true,
        line_name: true,
        operator_name: true,
        color_hex: true,
        fare_fcfa: true,
        frequency_minutes: true,
        city_id: true,
        _count: {
          /* stops est la relation directe UrbanLine → UrbanStop[] */
          select: { stops: true },
        },
      },
      orderBy: { line_number: "asc" },
    });

    /* Reformater pour exposer stops_count directement */
    const formatted = lines.map((l) => ({
      id: l.id,
      line_number: l.line_number,
      line_name: l.line_name,
      operator_name: l.operator_name,
      color_hex: l.color_hex,
      fare_fcfa: l.fare_fcfa,
      frequency_minutes: l.frequency_minutes,
      city_id: l.city_id,
      stops_count: l._count.stops,
    }));

    return reply.send({ lines: formatted });
  });

  /* ============================================================
   * GET /urban-lines/:id — Détail d'une ligne
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const line = await prisma.urbanLine.findUnique({
      where: { id },
      include: {
        city: { select: { id: true, name: true } },
      },
    });

    if (!line || !line.is_active) {
      return reply.status(404).send({ error: "Ligne introuvable", code: "LINE_NOT_FOUND" });
    }

    return reply.send({ line });
  });

  /* ============================================================
   * GET /urban-lines/:id/stops — Arrêts d'une ligne, ordonnés
   * L'ordre est donné par UrbanStop.sequence_order (numéroté depuis 1).
   * ============================================================ */
  app.get("/:id/stops", async (request, reply) => {
    const { id } = request.params as { id: string };

    /* Vérifier que la ligne existe */
    const line = await prisma.urbanLine.findUnique({
      where: { id },
      select: {
        id: true,
        line_number: true,
        line_name: true,
        color_hex: true,
        fare_fcfa: true,
        is_active: true,
      },
    });

    if (!line || !line.is_active) {
      return reply.status(404).send({ error: "Ligne introuvable", code: "LINE_NOT_FOUND" });
    }

    /*
     * Récupérer les arrêts triés par sequence_order.
     * UrbanStop.line_id est une FK directe — pas de table pivot à traverser.
     */
    const stops = await prisma.urbanStop.findMany({
      where: { line_id: id },
      select: {
        id: true,
        name: true,
        sequence_order: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { sequence_order: "asc" },
    });

    return reply.send({
      line: {
        id: line.id,
        line_number: line.line_number,
        line_name: line.line_name,
        color_hex: line.color_hex,
        fare_fcfa: line.fare_fcfa,
      },
      stops,
    });
  });
};
