/**
 * apps/api/src/app.ts — Configuration de l'application Fastify VIVRE
 *
 * Tous les plugins, middlewares et routes sont enregistrés ici.
 * L'ordre d'enregistrement des plugins Fastify est critique :
 * 1. Plugins d'infrastructure (helmet, cors, rate-limit)
 * 2. Plugins d'authentification (JWT)
 * 3. Plugins métier (multipart, swagger)
 * 4. Routes (sous /v1 — toutes les routes de l'API)
 *
 * Fastify utilise un système de plugins encapsulés : chaque plugin est
 * isolé dans son propre scope par défaut. Le flag { prefix: '/v1' }
 * préfixe toutes les routes enregistrées sous ce scope.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";

/* Routes par module (à décommenter au fur et à mesure du développement) */
// import { authRoutes } from './routes/auth.routes.js';
// import { citiesRoutes } from './routes/cities.routes.js';
// import { transportRoutes } from './routes/transport.routes.js';

/**
 * Construit et configure l'application Fastify VIVRE.
 * @returns Instance Fastify prête à écouter
 */
export async function buildApp(): Promise<FastifyInstance> {
  /* === CRÉATION DE L'INSTANCE === */
  const app = Fastify({
    /*
     * Pino logger — ultra-rapide (logs structurés JSON).
     * En développement : pino-pretty pour les logs lisibles par un humain.
     * En production : JSON brut ingéré par Datadog/CloudWatch.
     */
    logger:
      process.env["NODE_ENV"] === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "HH:MM:ss",
                ignore: "pid,hostname",
              },
            },
          }
        : true,
    /* Trust le header X-Forwarded-For derrière un reverse proxy (Nginx, Vercel) */
    trustProxy: true,
    /* Stringify stricte — rejette les valeurs undefined dans les réponses JSON */
    ajv: {
      customOptions: {
        strict: true,
        allErrors: true,
      },
    },
  });

  /* === PLUGIN : HELMET (sécurité HTTP headers) === */
  /*
   * Helmet ajoute les headers de sécurité essentiels :
   * - X-Content-Type-Options: nosniff
   * - X-Frame-Options: DENY (prévient le clickjacking)
   * - Content-Security-Policy (limite les origines des scripts)
   * - Strict-Transport-Security (force HTTPS en production)
   */
  await app.register(helmet, {
    contentSecurityPolicy:
      process.env["NODE_ENV"] === "production"
        ? undefined /* En prod : CSP stricte par défaut */
        : false,    /* En dev : désactivée pour les outils de debugging */
  });

  /* === PLUGIN : CORS === */
  /*
   * CORS autorise les requêtes cross-origin depuis les apps frontend.
   * En développement : autorise localhost:3000, :3002, :3003.
   * En production : autorise uniquement vivre.bf et les sous-domaines.
   *
   * Pourquoi ne pas utiliser '*' ? Incompatible avec credentials (cookies, JWT).
   * On doit lister explicitement les origines autorisées.
   */
  await app.register(cors, {
    origin: process.env["CORS_ORIGIN"]?.split(",") ?? [
      "http://localhost:3000", /* apps/web */
      "http://localhost:3002", /* apps/admin */
      "http://localhost:3003", /* apps/supplier */
    ],
    credentials: true, /* Autorise l'envoi de cookies et d'Authorization header */
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  /* === PLUGIN : RATE LIMITING === */
  /*
   * Limite le nombre de requêtes par IP pour prévenir l'abus.
   * Le rate limit global est de 100 req/min/IP.
   * Le endpoint /auth/send-otp a son propre rate limit (3/heure par numéro).
   *
   * Stockage dans Redis pour la cohérence en multi-instances (plusieurs pods).
   * Si Redis n'est pas disponible, fallback sur la mémoire locale.
   */
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    /* TODO: configurer Redis en production */
    /* redis: redisClient, */
    keyGenerator: (req) =>
      /* Utiliser l'IP réelle si derrière un proxy (Nginx, Vercel) */
      (req.headers["x-real-ip"] as string) ??
      req.socket.remoteAddress ??
      "unknown",
    errorResponseBuilder: (_req, context) => ({
      error: "Trop de requêtes, veuillez patienter",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        limit: context.max,
        remaining: context.remaining,
        retry_after: context.ttl,
      },
    }),
  });

  /* === PLUGIN : JWT === */
  /*
   * @fastify/jwt expose app.jwt.sign() et app.jwt.verify().
   * Le secret JWT doit faire au minimum 64 caractères (recommandation OWASP).
   * Générer avec : openssl rand -base64 64
   */
  await app.register(jwt, {
    secret: process.env["JWT_SECRET"] ?? "CHANGE_ME_IN_PRODUCTION_MINIMUM_64_CHARS",
    sign: {
      expiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
    },
  });

  /* === PLUGIN : MULTIPART (upload de fichiers) === */
  /*
   * Utilisé pour l'upload de photos (profil, propriétés, menu).
   * Les fichiers sont re-streamés vers S3 sans passer par le disque local.
   * Limite : 10MB par fichier, 5 fichiers max par requête.
   */
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, /* 10MB max par fichier */
      files: 5,                    /* Max 5 fichiers par requête */
    },
  });

  /* === ROUTES : enregistrement sous /v1 === */
  /*
   * Toutes les routes sont préfixées /v1 pour permettre des évolutions
   * de l'API sans casser les clients existants (v2 en parallèle si besoin).
   *
   * Les routes sont enregistrées dans des fichiers séparés par domaine métier.
   * Elles seront décommentées au fur et à mesure du développement des modules.
   */
  await app.register(
    async (v1) => {
      /* Endpoint de santé — utilisé par les health checks Docker et Kubernetes */
      v1.get("/health", async () => ({
        status: "ok",
        service: "vivre-api",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        environment: process.env["NODE_ENV"] ?? "development",
      }));

      /* TODO: enregistrer les routes au fur et à mesure du développement
       * await v1.register(authRoutes, { prefix: '/auth' });
       * await v1.register(citiesRoutes, { prefix: '/cities' });
       * await v1.register(transportRoutes, { prefix: '/transport' });
       * etc.
       */
    },
    { prefix: "/v1" }
  );

  /* === HOOK : GESTION GLOBALE DES ERREURS === */
  /*
   * Intercepte toutes les erreurs non gérées et les formate selon
   * la structure ApiError standard { error, code, details }.
   * Pino loggue l'erreur avec le stack trace pour le debugging.
   */
  app.setErrorHandler((error, _req, reply) => {
    app.log.error({ error }, "Erreur non gérée");

    /* Erreur Zod — validation échouée */
    if (error.name === "ZodError") {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: error.message,
      });
    }

    /* Erreur JWT — token invalide ou expiré */
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return reply.status(401).send({
        error: "Session invalide ou expirée",
        code: "AUTH_TOKEN_INVALID",
      });
    }

    /* Rate limit Fastify */
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: "Trop de requêtes, veuillez patienter",
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    /* Erreur générique — ne pas exposer les détails en production */
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error:
        process.env["NODE_ENV"] === "production"
          ? "Une erreur est survenue"
          : (error.message || "Erreur interne"),
      code: "INTERNAL_ERROR",
    });
  });

  /* === HOOK : ROUTE NON TROUVÉE === */
  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send({
      error: "Endpoint non trouvé",
      code: "NOT_FOUND",
    });
  });

  return app;
}
