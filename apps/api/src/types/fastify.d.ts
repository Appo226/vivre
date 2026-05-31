/**
 * types/fastify.d.ts — Augmentations de types pour Fastify
 *
 * Deux augmentations sont déclarées ici :
 *
 * 1. FastifySchema — ajout des champs OpenAPI (summary, tags, security, description)
 *    Ces champs sont ignorés par AJV (qui valide le body/query/params) mais sont
 *    utilisés par @fastify/swagger pour générer la documentation.
 *    Sans cette déclaration, TypeScript rejette ces champs avec TS2353.
 *
 * 2. FastifyJWT — typage du payload JWT avec JwtPayload
 *    Permet à request.user d'être typé JwtPayload dans tous les handlers
 *    au lieu du type générique `string | object | Buffer`.
 */

import type { JwtPayload } from "../services/jwt.service.js";

/* Extension de FastifySchema pour les métadonnées OpenAPI/Swagger */
declare module "fastify" {
  interface FastifySchema {
    summary?: string;
    tags?: string[];
    security?: Record<string, string[]>[];
    description?: string;
  }
}

/* Typage du payload JWT via le point d'extension officiel de @fastify/jwt */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
