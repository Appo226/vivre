/**
 * plugins/authenticate.ts — Hook d'authentification JWT pour les routes protégées
 *
 * Ce fichier exporte deux helpers utilisés dans les routes Fastify :
 *
 * 1. `authenticate` — Vérifie le JWT Bearer token. Lance une erreur 401 si absent/invalide.
 *    Usage : await authenticate(request, reply)
 *
 * 2. `requireRole` — Vérifie qu'un utilisateur a le rôle requis.
 *    Usage : await requireRole(request, reply, "admin")
 *
 * Fastify ne supporte pas les middlewares globaux comme Express.
 * On passe ces fonctions directement dans les handlers de route,
 * ou dans le hook `preHandler` d'un plugin encapsulé.
 *
 * Augmentation de type : request.user est déclaré sur FastifyRequest
 * pour accéder au payload JWT dans les handlers.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { JwtPayload } from "../services/jwt.service.js";
/*
 * Import de @fastify/swagger pour déclencher son augmentation de types.
 * @fastify/swagger étend FastifySchema avec summary, tags, security, description.
 * Cet import ici rend l'augmentation disponible dans tous les fichiers qui
 * importent authenticate.ts (ce qui inclut toutes les routes protégées).
 * L'underscore devant la variable indique qu'elle est importée pour ses effets
 * de bord sur les types uniquement — pas utilisée à l'exécution.
 */
import "@fastify/swagger";

/* ============================================================
 * HOOK D'AUTHENTIFICATION
 * ============================================================ */

/**
 * Vérifie le Bearer token JWT dans l'en-tête Authorization.
 * Si valide, injecte le payload décodé dans `request.user`.
 * Si absent ou invalide, répond 401 et interrompt le handler.
 *
 * @example
 * app.get('/me', async (request, reply) => {
 *   await authenticate(request, reply);
 *   // ici, request.user est garanti non-null
 *   return { userId: request.user.sub };
 * });
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    /*
     * app.jwt.verify() vérifie :
     * 1. La signature HMAC-SHA256 avec JWT_SECRET
     * 2. La date d'expiry (exp claim)
     * 3. La date d'émission (iat claim)
     * Lance une exception si l'un de ces checks échoue.
     */
    await request.jwtVerify<JwtPayload>();
  } catch {
    return reply.status(401).send({
      error: "Session invalide ou expirée. Veuillez vous reconnecter.",
      code: "AUTH_TOKEN_INVALID",
    });
  }
}

/* ============================================================
 * VÉRIFICATION DE RÔLE
 * ============================================================ */

/**
 * Vérifie qu'un utilisateur authentifié possède le rôle requis.
 * Doit être appelé APRÈS `authenticate()`.
 *
 * @param request - FastifyRequest avec user déjà peuplé
 * @param reply - FastifyReply pour envoyer le 403
 * @param role - Rôle requis ("admin" | "supplier" | "driver" | "customer")
 *
 * @example
 * await authenticate(request, reply);
 * await requireRole(request, reply, "admin");
 * // Seuls les admins arrivent ici
 */
export async function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  role: string
): Promise<void> {
  if (!request.user?.roles?.includes(role)) {
    return reply.status(403).send({
      error: "Accès refusé. Vous n'avez pas les permissions requises.",
      code: "AUTH_FORBIDDEN",
      details: { required_role: role },
    });
  }
}
