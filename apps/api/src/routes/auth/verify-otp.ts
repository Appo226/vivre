/**
 * routes/auth/verify-otp.ts — POST /v1/auth/verify-otp
 *
 * Vérifie le code OTP soumis par l'utilisateur et émet une paire
 * de tokens JWT (access + refresh) si le code est valide.
 *
 * Comportement selon l'état de l'utilisateur :
 * - Nouvel utilisateur (first_login) : crée le compte, retourne is_new_user=true
 *   → le frontend redirige vers l'écran de complétion de profil (S-004b)
 * - Utilisateur existant : met à jour last_login_at, retourne is_new_user=false
 *   → le frontend redirige vers l'écran d'accueil (H-001)
 *
 * Sécurité :
 * - Le code OTP est supprimé de Redis après vérification réussie (usage unique)
 * - Le refresh token est stocké dans Redis (révocable par logout)
 * - Le JWT payload contient les rôles pour éviter un aller-retour DB par requête
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { normalizePhone } from "@vivre/utils";
import { VerifyOtpBodySchema } from "../../schemas/auth.schema.js";
import { checkVerification } from "../../services/sms.service.js";
import {
  signAccessToken,
  createRefreshToken,
  getTokenExpiresAt,
  type JwtPayload,
} from "../../services/jwt.service.js";

export const verifyOtpRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: z.infer<typeof VerifyOtpBodySchema> }>(
    "/verify-otp",
    {
      schema: {
        summary: "Vérifier le code OTP et obtenir un JWT",
        tags: ["Authentification"],
        body: {
          type: "object",
          required: ["phone", "code"],
          properties: {
            phone: { type: "string", example: "+22670123456" },
            code: { type: "string", example: "123456" },
          },
        },
      },
    },
    async (request, reply) => {
      /* --- 1. Validation Zod --- */
      const parseResult = VerifyOtpBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(422).send({
          error: "Données invalides",
          code: "VALIDATION_ERROR",
          details: parseResult.error.errors[0]?.message,
        });
      }

      const { code } = parseResult.data;

      /* --- 2. Normalisation du numéro E.164 --- */
      const rawPhone = parseResult.data.phone;
      const isDev = process.env["NODE_ENV"] !== "production";
      const phone = normalizePhone(rawPhone) ?? (isDev ? rawPhone : null);
      if (!phone) {
        return reply.status(422).send({
          error: "Numéro de téléphone invalide",
          code: "PHONE_INVALID",
        });
      }

      /* --- 3. Vérification OTP (Twilio Verify en prod, Redis en dev) --- */
      const isValid = await checkVerification(phone, code);

      if (!isValid) {
        return reply.status(401).send({
          error: "Code incorrect ou expiré. Cliquez sur 'Renvoyer le code'.",
          code: "OTP_INVALID",
        });
      }

      /* --- 4. Upsert utilisateur (crée si nouveau, met à jour last_login_at) --- */
      const user = await prisma.user.upsert({
        where: { phone },
        create: {
          phone,
          preferred_language: "fr",
          is_verified: true,
          is_active: true,
        },
        update: {
          /* Mise à jour de la date de dernière connexion */
          last_login_at: new Date(),
          /* S'assurer que le compte est toujours actif */
          is_verified: true,
        },
        select: {
          id: true,
          phone: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar_url: true,
          preferred_language: true,
          is_verified: true,
          is_active: true,
          created_at: true,
          roles: {
            where: { is_approved: true },
            select: { role: true },
          },
        },
      });

      /* --- 5. Vérifier que le compte n'est pas bloqué --- */
      if (!user.is_active) {
        return reply.status(403).send({
          error: "Votre compte a été désactivé. Contactez support@vivre.bf",
          code: "ACCOUNT_SUSPENDED",
        });
      }

      /* --- 6. Créer le rôle "customer" si c'est le premier login --- */
      const isNewUser = user.roles.length === 0;

      if (isNewUser) {
        await prisma.userRole.create({
          data: {
            user_id: user.id,
            role: "customer",
            is_approved: true, /* Le rôle customer est auto-approuvé */
            approved_at: new Date(),
          },
        });
      }

      /* --- 7. Construire le payload JWT --- */
      const roles = isNewUser
        ? ["customer"]
        : user.roles.map((r: { role: string }) => r.role);

      const jwtPayload: JwtPayload = {
        sub: user.id,
        phone: user.phone,
        roles,
      };

      /* --- 8. Émettre les tokens --- */
      const accessToken = signAccessToken(
        (payload) => app.jwt.sign(payload),
        jwtPayload
      );
      const refreshToken = await createRefreshToken(user.id);

      app.log.info({ userId: user.id, isNewUser }, "Connexion réussie");

      /* --- 9. Réponse --- */
      return reply.status(200).send({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: getTokenExpiresAt(process.env["JWT_EXPIRES_IN"] ?? "7d"),
        is_new_user: isNewUser,
        user: {
          id: user.id,
          phone: user.phone,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          avatar_url: user.avatar_url,
          preferred_language: user.preferred_language,
          roles,
        },
      });
    }
  );
};
