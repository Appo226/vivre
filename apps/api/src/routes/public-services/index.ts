/**
 * routes/public-services/index.ts — Services publics burkinabè
 *
 * Endpoints :
 *   GET /public-services/categories    — Catégories (hôpitaux, pharmacies, police…)
 *   GET /public-services               — Services par catégorie + tri GPS PostGIS
 *   GET /public-services/on-duty       — Pharmacies de garde actives
 *   GET /public-services/:id           — Détail d'un service
 *   GET /emergency-numbers             — Numéros nationaux (SAMU, Police, Pompiers…)
 *   POST /service-corrections          — Signalement d'erreur crowdsourcé
 *
 * Spécificité critique : le tri par proximité GPS est fait via PostGIS ($queryRaw).
 * Les index GIST créés lors de l'Étape 2 (idx_public_services_location) accélèrent
 * ces requêtes même sur des tables volumineuses (milliers de services).
 *
 * Requêtes dynamiques : on utilise Prisma.sql + Prisma.join pour composer les
 * clauses WHERE dynamiquement sans injection SQL. Prisma.sql est un tagged template
 * qui paramètre automatiquement les valeurs interpolées.
 *
 * Mode hors-ligne : ces données sont mises en cache côté client (7 jours pour
 * les urgences, 1h pour les services courants). L'app reste utilisable sans réseau.
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { Prisma } from "@prisma/client";
import {
  PublicServicesQuerySchema,
  OnDutyQuerySchema,
  ServiceCorrectionBodySchema,
} from "../../schemas/geography.schema.js";

/* ============================================================
 * TYPE pour les résultats des requêtes PostGIS
 * ============================================================ */

type ServiceWithDistance = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone_primary: string | null;
  phone_emergency: string | null;
  is_open_now: boolean;
  is_on_duty: boolean;
  is_24h: boolean;
  on_duty_until: Date | null;
  opening_hours: unknown;
  distance_m: number | null;
  category_id: string;
  category_slug: string;
  category_name_fr: string;
  category_icon: string;
  category_color_hex: string;
};

export const publicServicesRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /public-services/categories
   * Données statiques — retourner toutes les catégories actives triées
   * ============================================================ */
  app.get("/categories", async (_request, reply) => {
    const categories = await prisma.publicServiceCategory.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
      select: {
        id: true,
        slug: true,
        name_fr: true,
        name_en: true,
        icon: true,
        color_hex: true,
        is_emergency: true,
        sort_order: true,
      },
    });

    return reply.send({ categories });
  });

  /* ============================================================
   * GET /public-services/on-duty — Pharmacies de garde
   * Triées par distance GPS si lat/lng fournis
   * ============================================================ */
  app.get("/on-duty", async (request, reply) => {
    const parseResult = OnDutyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { lat, lng, limit } = parseResult.data;

    /*
     * Si position GPS disponible → tri PostGIS par distance.
     * Sinon → tri par nom alphabétique (dégradé gracieux).
     */
    if (lat !== undefined && lng !== undefined) {
      const results = await prisma.$queryRaw<ServiceWithDistance[]>`
        SELECT
          ps.id, ps.name, ps.address, ps.latitude, ps.longitude,
          ps.phone_primary, ps.phone_emergency,
          ps.is_open_now, ps.is_on_duty, ps.is_24h, ps.on_duty_until,
          CAST(
            ST_Distance(
              CAST(ST_SetSRID(ST_MakePoint(ps.longitude, ps.latitude), 4326) AS geography),
              CAST(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geography)
            ) AS float8
          ) AS distance_m
        FROM public_services ps
        WHERE ps.is_on_duty = true AND ps.is_active = true
        ORDER BY distance_m ASC
        LIMIT ${limit}
      `;

      return reply.send({ pharmacies: results });
    }

    /* Sans GPS — retourner les pharmacies de garde sans distance */
    const pharmacies = await prisma.publicService.findMany({
      where: { is_on_duty: true, is_active: true },
      take: limit,
      select: {
        id: true, name: true, address: true,
        latitude: true, longitude: true,
        phone_primary: true, phone_emergency: true,
        is_on_duty: true, on_duty_until: true,
      },
    });

    return reply.send({ pharmacies });
  });

  /* ============================================================
   * GET /public-services — Liste par catégorie, triée par GPS
   * Point chaud de l'application : appelé à chaque ouverture de SP-002
   *
   * Approche pour les conditions dynamiques :
   *   Prisma.sql crée des fragments SQL paramétrés (évite l'injection).
   *   Prisma.join les concatène avec " AND " pour former le WHERE.
   *   Sans coordonnées GPS, on tombe sur une requête Prisma standard.
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = PublicServicesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Paramètres invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { city_id, category_id, category_slug, lat, lng, is_on_duty, is_open_now, limit, page } = parseResult.data;
    const offset = (page - 1) * limit;

    /* Résoudre category_id depuis le slug si nécessaire */
    let resolvedCategoryId = category_id;
    if (!resolvedCategoryId && category_slug) {
      const cat = await prisma.publicServiceCategory.findUnique({
        where: { slug: category_slug },
        select: { id: true },
      });
      if (!cat) {
        return reply.status(404).send({ error: "Catégorie introuvable", code: "CATEGORY_NOT_FOUND" });
      }
      resolvedCategoryId = cat.id;
    }

    /*
     * Tri PostGIS par distance si coordonnées GPS fournies.
     * C'est le cas normal sur mobile (position GPS disponible).
     * L'index GIST (idx_public_services_location) rend ce tri très efficace.
     *
     * On construit les conditions WHERE avec Prisma.sql (fragments paramétrés)
     * puis Prisma.join les assemble. C'est l'approche officielle Prisma 5
     * pour les requêtes raw dynamiques — évite toute injection SQL.
     */
    if (lat !== undefined && lng !== undefined) {
      /* Construire les conditions WHERE via Prisma.sql (fragments paramétrés) */
      const filters: Prisma.Sql[] = [Prisma.sql`ps.is_active = true`];

      if (resolvedCategoryId) {
        /* CAST uuid requis car Prisma paramètre la valeur comme text par défaut */
        filters.push(Prisma.sql`ps.category_id = ${resolvedCategoryId}::uuid`);
      }
      if (city_id) {
        filters.push(Prisma.sql`ps.city_id = ${city_id}::uuid`);
      }
      if (is_on_duty === "true") {
        filters.push(Prisma.sql`ps.is_on_duty = true`);
      }
      if (is_open_now === "true") {
        filters.push(Prisma.sql`ps.is_open_now = true`);
      }

      /* Prisma.join assemble les fragments avec le séparateur donné */
      const whereClause = Prisma.join(filters, " AND ");

      const results = await prisma.$queryRaw<ServiceWithDistance[]>`
        SELECT
          ps.id, ps.name, ps.address, ps.latitude, ps.longitude,
          ps.phone_primary, ps.phone_emergency,
          ps.is_open_now, ps.is_on_duty, ps.is_24h, ps.on_duty_until,
          ps.opening_hours,
          psc.id as category_id, psc.slug as category_slug,
          psc.name_fr as category_name_fr, psc.icon as category_icon,
          psc.color_hex as category_color_hex,
          CAST(
            ST_Distance(
              CAST(ST_SetSRID(ST_MakePoint(ps.longitude, ps.latitude), 4326) AS geography),
              CAST(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geography)
            ) AS float8
          ) AS distance_m
        FROM public_services ps
        JOIN public_service_categories psc ON ps.category_id = psc.id
        WHERE ${whereClause}
        ORDER BY distance_m ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return reply.send({ services: results, page, limit });
    }

    /* Sans GPS → requête Prisma standard, tri par nom */
    const services = await prisma.publicService.findMany({
      where: {
        is_active: true,
        ...(resolvedCategoryId && { category_id: resolvedCategoryId }),
        ...(city_id && { city_id }),
        ...(is_on_duty === "true" && { is_on_duty: true }),
        ...(is_open_now === "true" && { is_open_now: true }),
      },
      include: {
        category: {
          select: {
            id: true, slug: true, name_fr: true, icon: true, color_hex: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });

    /* Aplatir la structure pour correspondre à la réponse avec GPS */
    const flat = services.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      phone_primary: s.phone_primary,
      phone_emergency: s.phone_emergency,
      is_open_now: s.is_open_now,
      is_on_duty: s.is_on_duty,
      is_24h: s.is_24h,
      on_duty_until: s.on_duty_until,
      opening_hours: s.opening_hours,
      category_id: s.category.id,
      category_slug: s.category.slug,
      category_name_fr: s.category.name_fr,
      category_icon: s.category.icon,
      category_color_hex: s.category.color_hex,
      distance_m: null,
    }));

    return reply.send({ services: flat, page, limit });
  });

  /* ============================================================
   * GET /public-services/:id — Détail complet d'un service
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const service = await prisma.publicService.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true, slug: true, name_fr: true, name_en: true,
            icon: true, color_hex: true, is_emergency: true,
          },
        },
        city: { select: { id: true, name: true } },
      },
    });

    if (!service || !service.is_active) {
      return reply.status(404).send({
        error: "Service introuvable",
        code: "SERVICE_NOT_FOUND",
      });
    }

    return reply.send({ service });
  });

  /* ============================================================
   * GET /emergency-numbers — Numéros d'urgence nationaux
   * Données statiques mises en cache côté client (7 jours).
   * Accessibles sans connexion après le premier chargement.
   * ============================================================ */
  app.get("/emergency-numbers", async (_request, reply) => {
    const numbers = await prisma.emergencyNumber.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
      select: {
        id: true,
        service_name: true,
        service_name_en: true,
        number: true,
        icon: true,
        color_hex: true,
        sort_order: true,
      },
    });

    /* Header Cache-Control pour le navigateur et le Service Worker PWA */
    void reply.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    return reply.send({ numbers });
  });
};

/* ============================================================
 * SERVICE CORRECTIONS (signalement d'erreur crowdsourcé)
 * Route séparée car enregistrée à la racine /v1, pas sous /public-services
 * ============================================================ */

export const serviceCorrectionsRoute: FastifyPluginAsync = async (app) => {
  app.post("/service-corrections", async (request, reply) => {
    const parseResult = ServiceCorrectionBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { service_id, correction_type, description } = parseResult.data;

    /* Vérifier que le service existe avant d'enregistrer la correction */
    const service = await prisma.publicService.findUnique({
      where: { id: service_id },
      select: { id: true },
    });

    if (!service) {
      return reply.status(404).send({
        error: "Service introuvable",
        code: "SERVICE_NOT_FOUND",
      });
    }

    /* Récupérer l'user_id si connecté (token optionnel) */
    let userId: string | null = null;
    try {
      await request.jwtVerify();
      userId = (request.user as { sub: string }).sub;
    } catch {
      /* Signalement anonyme accepté — pas de token requis */
    }

    await prisma.serviceCorrection.create({
      data: {
        service_id,
        correction_type,
        description,
        user_id: userId,
        status: "pending",
      },
    });

    return reply.status(201).send({
      message: "Signalement reçu — merci pour votre contribution !",
    });
  });
};
