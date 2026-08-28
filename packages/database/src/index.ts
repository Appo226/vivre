/**
 * packages/database/src/index.ts — Client Prisma singleton pour le monorepo VIVRE
 *
 * Pourquoi un singleton ?
 * En développement, Next.js (HMR) et Fastify peuvent créer plusieurs instances
 * du client Prisma à chaque hot-reload. Chaque instance ouvre un pool de connexions
 * PostgreSQL. Sans singleton, on peut dépasser le max_connections de PostgreSQL
 * (défaut: 100) après quelques reloads — connexions épuisées, erreurs critiques.
 *
 * Pattern standard recommandé par Prisma pour les environnements avec HMR :
 * https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prevent-hot-reloading-from-creating-new-instances-of-prismaclient
 *
 * En production : une seule instance Prisma par processus Node.js — pas de problème.
 * En développement : l'instance est mise en cache dans globalThis pour survivre aux reloads.
 */

import { PrismaClient } from "@prisma/client";

/**
 * connection_limit=1 était hérité d'un ancien hébergement Render en tier gratuit — hors
 * sujet pour ce déploiement (Vercel + Supavisor). Sur Vercel Fluid Compute, une même
 * instance chaude sert PLUSIEURS requêtes concurrentes avec le même client Prisma
 * singleton : avec une seule connexion, deux requêtes simultanées (ou une seule requête
 * qui fait un Promise.all de plusieurs appels Prisma — plusieurs endpoints le font) se
 * mettent en file d'attente sur cette unique connexion, et peuvent expirer après
 * pool_timeout (erreur P2024, exactement celle vue en boucle en dev local dès que deux
 * scripts se disputaient la connexion). Le pooler Supabase (Supavisor, port 6543,
 * pgbouncer=true) multiplexe déjà les connexions côté serveur — le client Prisma n'a pas
 * besoin d'être artificiellement limité à 1 pour ça.
 *
 * DATABASE_CONNECTION_LIMIT permet d'ajuster cette valeur sans redéploiement de code une
 * fois la vraie capacité du pooler Supabase confirmée dans son dashboard (Database →
 * Connection Pooling → Pool Size) — 5 est une valeur de départ raisonnable pour l'échelle
 * pilote (quelques organisateurs), pas un chiffre dérivé de cette capacité réelle.
 */
function buildDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  // Skip if the user already set these params explicitly
  if (url.includes("connection_limit")) return url;
  const connectionLimit = process.env["DATABASE_CONNECTION_LIMIT"] ?? "5";
  return `${url}${sep}connection_limit=${connectionLimit}&pool_timeout=15&connect_timeout=10`;
}

/**
 * Extension globale du type global de Node.js pour stocker l'instance Prisma.
 * Nécessaire pour TypeScript strict — on ne peut pas ajouter des propriétés
 * arbitraires à globalThis sans déclarer leur type.
 */
declare global {
  /* eslint-disable no-var */
  var __prismaClient: PrismaClient | undefined;
}

/**
 * Crée le client Prisma avec la configuration appropriée selon l'environnement.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log:
      process.env["NODE_ENV"] === "development"
        ? [
            /* En développement : logger toutes les requêtes SQL pour le debugging */
            { emit: "stdout", level: "query" },
            { emit: "stdout", level: "info" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [
            /* En production : logger uniquement les avertissements et erreurs */
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ],
    errorFormat:
      process.env["NODE_ENV"] === "development"
        ? "pretty" /* Stack traces lisibles en développement */
        : "minimal", /* Moins verbose en production */
  });
}

/**
 * Client Prisma singleton.
 *
 * En développement : réutilise l'instance stockée dans globalThis si elle existe.
 * En production : crée toujours une nouvelle instance (pas de HMR).
 */
export const prisma: PrismaClient =
  globalThis.__prismaClient ?? createPrismaClient();

/* Stocker l'instance dans globalThis pour le HMR Next.js (développement uniquement) */
if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prismaClient = prisma;
}

/* Re-export des types Prisma générés pour un usage dans les repositories */
export type {
  User,
  UserRole,
  OtpCode,
  City,
  TransportCompany,
  Route,
  Schedule,
  Trip,
  TransportBooking,
  Driver,
  RideRequest,
  UrbanLine,
  UrbanStop,
  Property,
  RoomType,
  PropertyBooking,
  Restaurant,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  Attraction,
  Guide,
  GuideBooking,
  Payment,
  Refund,
  Review,
  Media,
  Notification,
  PromoCode,
  PublicServiceCategory,
  PublicService,
  EmergencyNumber,
  ServiceCorrection,
} from "@prisma/client";

/* Re-export du PrismaClient pour les types de transaction */
export { PrismaClient, Prisma } from "@prisma/client";
