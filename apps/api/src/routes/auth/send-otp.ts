/**
 * routes/auth/send-otp.ts — POST /v1/auth/send-otp
 *
 * Triggers an OTP via Twilio Verify (production) or returns a dev_code
 * directly in the response (development / no credentials).
 *
 * Rate limit: max 3 sends/hour per number (Redis), on top of Twilio's own limits.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { normalizePhone } from "@vivre/utils";
import { SendOtpBodySchema } from "../../schemas/auth.schema.js";
import { sendVerification } from "../../services/sms.service.js";
import { checkAndIncrementRateLimit } from "../../services/otp.service.js";

export const sendOtpRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Body: z.infer<typeof SendOtpBodySchema> }>(
    "/send-otp",
    {
      schema: {
        summary: "Envoyer un code OTP par SMS",
        tags: ["Authentification"],
        body: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: {
              type: "string",
              description: "Numéro de téléphone (+226 local ou international E.164)",
              example: "+22670123456",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message:           { type: "string" },
              expires_in:        { type: "number" },
              remaining_attempts:{ type: "number" },
              dev_code:          { type: "string" },
            },
          },
          429: {
            type: "object",
            properties: {
              error:       { type: "string" },
              code:        { type: "string" },
              retry_after: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      /* --- 1. Validation Zod --- */
      const parseResult = SendOtpBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(422).send({
          error: "Numéro de téléphone invalide",
          code: "VALIDATION_ERROR",
          details: parseResult.error.errors[0]?.message,
        });
      }

      /* --- 2. Normalise to E.164; in dev accept any number --- */
      const rawPhone = parseResult.data.phone;
      const isDev    = process.env["NODE_ENV"] !== "production";
      const phone    = normalizePhone(rawPhone) ?? (isDev ? rawPhone : null);

      if (!phone) {
        return reply.status(422).send({
          error: "Format de numéro invalide. Utilisez +22670123456 ou 70123456",
          code: "PHONE_INVALID",
        });
      }

      /* --- 3. Rate limit (Redis) --- */
      const rateCheck = await checkAndIncrementRateLimit(phone);
      if (!rateCheck.allowed) {
        app.log.warn({ phone }, "Rate limit OTP atteint");
        return reply.status(429).send({
          error: "Trop de demandes. Réessayez dans quelques minutes.",
          code: "OTP_RATE_LIMIT_EXCEEDED",
          retry_after: rateCheck.retryAfter,
        });
      }

      /* --- 4. Send via Twilio Verify (or dev fallback) --- */
      try {
        const { devCode } = await sendVerification(phone);
        app.log.info({ phone }, "OTP envoyé");

        return reply.status(200).send({
          message:            "Code OTP envoyé par SMS",
          expires_in:         300,
          remaining_attempts: rateCheck.remaining,
          ...(isDev && devCode && { dev_code: devCode }),
        });
      } catch (err) {
        app.log.error({ phone, err }, "Échec envoi OTP");
        return reply.status(503).send({
          error: "Impossible d'envoyer le SMS. Vérifiez votre numéro et réessayez.",
          code: "SMS_SEND_FAILED",
        });
      }
    }
  );
};
