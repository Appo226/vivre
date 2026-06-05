/**
 * routes/auth/send-otp.ts — POST /v1/auth/send-otp
 *
 * Génère un code OTP à 6 chiffres, le stocke dans Redis (TTL 5min)
 * et l'envoie par SMS via Twilio.
 *
 * Règles métier :
 * - Max 3 envois par heure par numéro (anti-spam, contrôle coût SMS)
 * - Le code précédent est écrasé si un nouveau est demandé
 * - Le numéro est normalisé vers +226XXXXXXXX avant stockage
 * - En mode dev sans Twilio, le code s'affiche en console
 *
 * Rate limit spécifique : en plus du rate limit global (100/min/IP),
 * ce endpoint a un rate limit métier de 3 envois/heure/téléphone.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { normalizePhone } from "@vivre/utils";
import { SendOtpBodySchema } from "../../schemas/auth.schema.js";
import { generateOtpCode, sendOtpSms } from "../../services/sms.service.js";
import { saveOtp, checkAndIncrementRateLimit } from "../../services/otp.service.js";

export const sendOtpRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: z.infer<typeof SendOtpBodySchema> }>(
    "/send-otp",
    {
      /* Schéma JSON Schema pour Fastify (documentation Swagger automatique) */
      schema: {
        summary: "Envoyer un code OTP par SMS",
        tags: ["Authentification"],
        body: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: {
              type: "string",
              description: "Numéro de téléphone burkinabè (+226 ou local)",
              example: "+22670123456",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string" },
              expires_in: { type: "number" },
              remaining_attempts: { type: "number" },
              dev_code: { type: "string" },
            },
          },
          429: {
            type: "object",
            properties: {
              error: { type: "string" },
              code: { type: "string" },
              retry_after: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      /* --- 1. Validation Zod (normalise aussi les espaces dans le numéro) --- */
      const parseResult = SendOtpBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(422).send({
          error: "Numéro de téléphone invalide",
          code: "VALIDATION_ERROR",
          details: parseResult.error.errors[0]?.message,
        });
      }

      /* --- 2. Normalisation E.164 (+226XXXXXXXX) --- */
      const rawPhone = parseResult.data.phone;
      /* In dev, pass through any +XX international number for testing */
      const isDev = process.env["NODE_ENV"] !== "production";
      const phone = normalizePhone(rawPhone) ??
        (isDev && rawPhone.startsWith("+") ? rawPhone : null);

      if (!phone) {
        return reply.status(422).send({
          error: "Format de numéro invalide. Utilisez +22670123456 ou 70123456",
          code: "PHONE_INVALID",
        });
      }

      /* --- 3. Rate limiting : max 3 envois/heure par numéro --- */
      const rateCheck = await checkAndIncrementRateLimit(phone);

      if (!rateCheck.allowed) {
        app.log.warn({ phone }, "Rate limit OTP atteint");
        return reply.status(429).send({
          error: "Trop de demandes. Réessayez dans quelques minutes.",
          code: "OTP_RATE_LIMIT_EXCEEDED",
          retry_after: rateCheck.retryAfter,
        });
      }

      /* --- 4. Génération et stockage du code OTP --- */
      const code = generateOtpCode();
      try {
        await saveOtp(phone, code);
      } catch (redisErr) {
        app.log.error({ phone, error: redisErr }, "Redis indisponible — impossible de stocker l'OTP");
        return reply.status(503).send({
          error: "Service temporairement indisponible. Réessayez dans quelques instants.",
          code: "SERVICE_UNAVAILABLE",
        });
      }

      /* --- 5. Envoi SMS (console en dev, Twilio en prod) --- */
      try {
        await sendOtpSms(phone, code);
      } catch (smsError) {
        app.log.error({ phone, error: smsError }, "Échec envoi SMS OTP");
        return reply.status(503).send({
          error: "Impossible d'envoyer le SMS. Vérifiez votre numéro et réessayez.",
          code: "SMS_SEND_FAILED",
        });
      }

      app.log.info({ phone }, "OTP envoyé");

      return reply.status(200).send({
        message: "Code OTP envoyé par SMS",
        expires_in: 300,
        remaining_attempts: rateCheck.remaining,
        /* Dev only — never sent in production */
        ...(isDev && { dev_code: code }),
      });
    }
  );
};
