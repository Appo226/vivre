/**
 * POST /api/auth/forgot-password/reset — Vérifie l'OTP de reset et applique le nouveau mot de passe.
 *
 * Purpose "reset" — distinct de "verify" (vérification de numéro à l'inscription) même si
 * le mécanisme de vérification est identique, pour ne pas qu'un code de l'un serve pour
 * l'autre. Réinitialise aussi le verrouillage de connexion (failed_login_attempts /
 * login_locked_until) : légitime de recommencer à zéro puisque l'identité vient d'être
 * reconfirmée par OTP.
 */

import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordResetSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { hashPassword } from "@/lib/password";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";

const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = forgotPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { phone, code, new_password } = parsed.data;

  const activeCodes = await prisma.otpCode.findMany({
    where: { phone, purpose: "reset", used_at: null, expires_at: { gt: new Date() } },
  });
  type ActiveCode = (typeof activeCodes)[number];

  const totalFailedAttempts = activeCodes.reduce((sum: number, c: ActiveCode) => sum + c.failed_attempts, 0);
  if (activeCodes.length > 0 && totalFailedAttempts >= MAX_VERIFY_ATTEMPTS) {
    await prisma.otpCode.updateMany({
      where: { id: { in: activeCodes.map((c: ActiveCode) => c.id) } },
      data: { used_at: new Date() },
    });
    return apiError(429, "VERIFY_ATTEMPTS_EXCEEDED", "Trop de tentatives incorrectes. Redemandez un code.");
  }

  const otp = activeCodes.find((c: ActiveCode) => c.code === code);
  if (!otp) {
    if (activeCodes.length > 0) {
      await prisma.otpCode.updateMany({
        where: { id: { in: activeCodes.map((c: ActiveCode) => c.id) } },
        data: { failed_attempts: { increment: 1 } },
      });
    }
    return apiError(401, "OTP_INVALID", "Code incorrect ou expiré. Redemandez un code.");
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, username: true, first_name: true, last_name: true, email: true, avatar_url: true, preferred_language: true, is_active: true, is_verified: true },
  });
  if (!user) {
    return apiError(404, "USER_NOT_FOUND", "Compte introuvable");
  }
  if (!user.is_active) {
    return apiError(403, "ACCOUNT_SUSPENDED", "Votre compte a été désactivé.");
  }

  const password_hash = await hashPassword(new_password);

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { used_at: new Date() } }),
    prisma.user.update({
      where: { id: user.id },
      data: { password_hash, failed_login_attempts: 0, login_locked_until: null },
    }),
  ]);

  const roles = (
    await prisma.userRole.findMany({ where: { user_id: user.id, is_approved: true }, select: { role: true } })
  ).map((r) => r.role);

  const accessToken = await signAccessToken({ sub: user.id, phone, roles });
  const refreshToken = await signRefreshToken(user.id);

  return NextResponse.json({
    message: "Mot de passe réinitialisé",
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      phone,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      avatar_url: user.avatar_url,
      preferred_language: user.preferred_language,
      is_verified: user.is_verified,
      roles,
    },
  });
}
