/**
 * POST /api/auth/send-otp
 *
 * Génère un code OTP à 6 chiffres et le livre via le canal configuré
 * (voir src/lib/otp-channel.ts — "dev" par défaut, gratuit).
 * Rate limit : 3 envois / heure / numéro, appliqué via Postgres (pas de Redis).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { phoneSchema } from "@vivre/utils";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { sendOtpCode } from "@/lib/otp-channel";

const BodySchema = z.object({ phone: phoneSchema, demo_code: z.string().optional() });

const OTP_EXPIRES_SECONDS = 300; // 5 minutes — doit matcher OTP_DURATION côté frontend
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "PHONE_INVALID", "Numéro de téléphone invalide", parsed.error.errors[0]?.message);
  }
  const { phone, demo_code: demoCode } = parsed.data;

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.otpCode.count({
    where: { phone, purpose: "login", created_at: { gte: windowStart } },
  });

  if (recentCount >= RATE_LIMIT_MAX) {
    const oldestInWindow = await prisma.otpCode.findFirst({
      where: { phone, purpose: "login", created_at: { gte: windowStart } },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    });
    const retryAfter = oldestInWindow
      ? Math.max(0, Math.ceil((oldestInWindow.created_at.getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000))
      : 3600;
    return NextResponse.json(
      {
        error: "Trop de demandes. Réessayez dans quelques minutes.",
        code: "OTP_RATE_LIMIT_EXCEEDED",
        retry_after: retryAfter,
      },
      { status: 429 }
    );
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_SECONDS * 1000);

  await prisma.otpCode.create({
    data: { phone, code, purpose: "login", expires_at: expiresAt },
  });

  try {
    const { devCode } = await sendOtpCode(phone, code, demoCode);
    return NextResponse.json({
      message: "Code OTP envoyé",
      expires_in: OTP_EXPIRES_SECONDS,
      remaining_attempts: RATE_LIMIT_MAX - recentCount - 1,
      ...(devCode && { dev_code: devCode }),
    });
  } catch (err) {
    return apiError(503, "OTP_SEND_FAILED", "Impossible d'envoyer le code. Réessayez.", (err as Error).message);
  }
}
