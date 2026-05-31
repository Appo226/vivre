/**
 * routes/auth/logout.ts — POST /v1/auth/logout
 *
 * Révoque le refresh token de la session en cours.
 * L'access_token reste techniquement valide jusqu'à son expiry (7 jours)
 * mais le refresh_token est invalidé, empêchant le renouvellement.
 *
 * Côté client, le logout doit aussi :
 * 1. Supprimer l'access_token du localStorage/cookie
 * 2. Supprimer le refresh_token
 * 3. Rediriger vers la page de connexion
 *
 * Route protégée : nécessite un access_token valide (évite les logouts forcés).
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../plugins/authenticate.js";
import { revokeRefreshToken } from "../../services/jwt.service.js";

export const logoutRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/logout",
    {
      schema: {
        summary: "Se déconnecter (révoquer le refresh token)",
        tags: ["Authentification"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["refresh_token"],
          properties: {
            refresh_token: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      /* Vérifier l'access_token (requis pour éviter le logout forcé par un tiers) */
      await authenticate(request, reply);
      if (reply.sent) return; /* authenticate a envoyé un 401 */

      const body = request.body as { refresh_token?: string };
      const userId = request.user.sub;

      /* Révoquer le refresh token si fourni */
      if (body.refresh_token) {
        await revokeRefreshToken(userId, body.refresh_token);
      }

      app.log.info({ userId }, "Déconnexion");

      return reply.status(200).send({
        message: "Déconnecté avec succès.",
      });
    }
  );
};
