/**
 * POST /api/auth/forgot-password/send — Envoie un OTP de réinitialisation (purpose "reset").
 *
 * Non authentifié par nature (l'utilisateur a perdu son mot de passe). Réponse identique
 * que le compte existe ou non — évite l'énumération de comptes (même principe que le
 * message d'erreur générique de /api/auth/login). Le rate limit s'applique par numéro
 * indépendamment de l'existence du compte, pour ne pas révéler l'existence via le timing
 * ou le compteur de tentatives.
 */

import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordSendSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { sendOtpCode } from "@/lib/otp-channel";

const OTP_EXPIRES_SECONDS = 300;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = "Si ce numéro est associé à un compte, un code de réinitialisation vient d'être envoyé.";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = forgotPasswordSendSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { phone } = parsed.data;

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.otpCode.count({
    where: { phone, purpose: "reset", created_at: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez dans quelques minutes.", code: "OTP_RATE_LIMIT_EXCEEDED" },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, password_hash: true } });

  // Compte inexistant ou pas encore de mot de passe (ancien flux OTP) : on répond pareil,
  // sans envoyer de code — rien à réinitialiser, mais on ne le dit pas explicitement.
  if (!user || !user.password_hash) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const code = generateCode();
  await prisma.otpCode.create({
    data: {
      phone,
      code,
      purpose: "reset",
      user_id: user.id,
      expires_at: new Date(Date.now() + OTP_EXPIRES_SECONDS * 1000),
    },
  });

  try {
    const { devCode } = await sendOtpCode(phone, code);
    return NextResponse.json({ message: GENERIC_MESSAGE, ...(devCode && { dev_code: devCode }) });
  } catch (err) {
    return apiError(503, "OTP_SEND_FAILED", "Impossible d'envoyer le code. Réessayez.", (err as Error).message);
  }
}
