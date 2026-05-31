/**
 * routes/auth/refresh.ts — POST /v1/auth/refresh
 *
 * Renouvelle l'access_token JWT sans re-saisie du code OTP.
 * Utilise le refresh_token (stocké dans Redis) pour identifier l'utilisateur.
 *
 * Rotation des tokens :
 * L'ancien refresh_token est révoqué et remplacé par un nouveau à chaque refresh.
 * Si un attaquant vole un refresh_token, l'utilisateur légitime obtiendra une erreur
 * 401 au prochain refresh, l'alertant d'une compromission potentielle.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { RefreshTokenBodySchema } from "../../schemas/auth.schema.js";
import {
  validateRefreshToken,
  revokeRefreshToken,
  createRefreshToken,
  signAccessToken,
  getTokenExpiresAt,
  type JwtPayload,
} from "../../services/jwt.service.js";

export const refreshRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: z.infer<typeof RefreshTokenBodySchema> }>(
    "/refresh",
    {
      schema: {
        summary: "Renouveler le token d'accès",
        tags: ["Authentification"],
      },
    },
    async (request, reply) => {
      /* --- 1. Validation Zod --- */
      const parseResult = RefreshTokenBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(422).send({
          error: "Données invalides",
          code: "VALIDATION_ERROR",
          details: parseResult.error.errors[0]?.message,
        });
      }

      const { refresh_token, user_id } = parseResult.data;

      /* --- 2. Valider le refresh token dans Redis --- */
      const isValid = await validateRefreshToken(user_id, refresh_token);
      if (!isValid) {
        return reply.status(401).send({
          error: "Session expirée. Veuillez vous reconnecter.",
          code: "REFRESH_TOKEN_INVALID",
        });
      }

      /* --- 3. Charger l'utilisateur (rôles actuels) --- */
      const user = await prisma.user.findUnique({
        where: { id: user_id },
        select: {
          id: true,
          phone: true,
          is_active: true,
          roles: {
            where: { is_approved: true },
            select: { role: true },
          },
        },
      });

      if (!user || !user.is_active) {
        await revokeRefreshToken(user_id, refresh_token);
        return reply.status(401).send({
          error: "Compte introuvable ou désactivé.",
          code: "USER_NOT_FOUND",
        });
      }

      /* --- 4. Rotation : révoquer l'ancien refresh token, en créer un nouveau --- */
      await revokeRefreshToken(user_id, refresh_token);
      const newRefreshToken = await createRefreshToken(user_id);

      /* --- 5. Nouveau access token --- */
      const jwtPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        roles: user.roles.map((r) => r.role),
      };

      const accessToken = signAccessToken(
        (payload) => app.jwt.sign(payload),
        jwtPayload
      );

      return reply.status(200).send({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_at: getTokenExpiresAt(process.env["JWT_EXPIRES_IN"] ?? "7d"),
      });
    }
  );
};
