/**
 * POST /api/auth/verify-phone/send — (Re)envoie le code de vérification du numéro.
 *
 * Authentifié — le téléphone vient du token, jamais du body. Appelé automatiquement une
 * fois par /api/auth/register ; cet endpoint sert au bouton "Renvoyer le code" si le
 * premier envoi a échoué ou expiré. Même rate limit que l'ancien send-otp : 3/heure/numéro.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { sendOtpCode } from "@/lib/otp-channel";

const OTP_EXPIRES_SECONDS = 300;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { is_verified: true, phone: true } });
  if (!user) {
    return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable");
  }
  if (user.is_verified) {
    return NextResponse.json({ message: "Numéro déjà vérifié", is_verified: true });
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.otpCode.count({
    where: { phone: user.phone, purpose: "verify", created_at: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez dans quelques minutes.", code: "OTP_RATE_LIMIT_EXCEEDED" },
      { status: 429 }
    );
  }

  const code = generateCode();
  await prisma.otpCode.create({
    data: {
      phone: user.phone,
      code,
      purpose: "verify",
      user_id: auth.sub,
      expires_at: new Date(Date.now() + OTP_EXPIRES_SECONDS * 1000),
    },
  });

  try {
    const { devCode } = await sendOtpCode(user.phone, code);
    return NextResponse.json({
      message: "Code envoyé",
      expires_in: OTP_EXPIRES_SECONDS,
      ...(devCode && { dev_code: devCode }),
    });
  } catch (err) {
    return apiError(503, "OTP_SEND_FAILED", "Impossible d'envoyer le code. Réessayez.", (err as Error).message);
  }
}
