/**
 * POST /api/auth/verify-phone — Confirme le code OTP envoyé à l'inscription (purpose "verify").
 *
 * Authentifié : le téléphone vient du token, jamais du body — empêche de vérifier le
 * numéro de quelqu'un d'autre en devinant son code. Même logique anti-brute-force que
 * l'ancien verify-otp : au-delà de MAX_VERIFY_ATTEMPTS essais incorrects cumulés sur les
 * codes actifs, ils sont tous invalidés et il faut en redemander un.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyPhoneSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = verifyPhoneSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { code } = parsed.data;

  const activeCodes = await prisma.otpCode.findMany({
    where: { phone: auth.phone, purpose: "verify", used_at: null, expires_at: { gt: new Date() } },
  });
  type ActiveCode = (typeof activeCodes)[number];

  const totalFailedAttempts = activeCodes.reduce((sum: number, c: ActiveCode) => sum + c.failed_attempts, 0);
  if (activeCodes.length > 0 && totalFailedAttempts >= MAX_VERIFY_ATTEMPTS) {
    await prisma.otpCode.updateMany({
      where: { id: { in: activeCodes.map((c: ActiveCode) => c.id) } },
      data: { used_at: new Date() },
    });
    return apiError(429, "VERIFY_ATTEMPTS_EXCEEDED", "Trop de tentatives incorrectes. Demandez un nouveau code.");
  }

  const otp = activeCodes.find((c: ActiveCode) => c.code === code);
  if (!otp) {
    if (activeCodes.length > 0) {
      await prisma.otpCode.updateMany({
        where: { id: { in: activeCodes.map((c: ActiveCode) => c.id) } },
        data: { failed_attempts: { increment: 1 } },
      });
    }
    return apiError(401, "OTP_INVALID", "Code incorrect ou expiré. Cliquez sur 'Renvoyer le code'.");
  }

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { used_at: new Date() } }),
    prisma.user.update({ where: { id: auth.sub }, data: { is_verified: true } }),
  ]);

  return NextResponse.json({ message: "Numéro vérifié", is_verified: true });
}
