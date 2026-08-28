/**
 * POST /api/auth/verify-otp
 *
 * Vérifie le code OTP, crée/retrouve l'utilisateur, émet access + refresh tokens (JWT stateless).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { phoneSchema, otpCodeSchema } from "@vivre/utils";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";

const BodySchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

// send-otp est déjà limité à 3 envois/heure, mais rien ne bornait le nombre d'essais de
// code contre un envoi déjà effectué. Au-delà de ce seuil, on invalide tous les codes actifs
// pour ce numéro — il faut redemander un envoi (donc repasser par la limite de send-otp).
const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { phone, code } = parsed.data;

  const activeCodes = await prisma.otpCode.findMany({
    where: { phone, purpose: "login", used_at: null, expires_at: { gt: new Date() } },
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

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used_at: new Date() } });

  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, preferred_language: "fr", is_verified: true, is_active: true },
    update: { last_login_at: new Date(), is_verified: true },
    select: {
      id: true,
      phone: true,
      username: true,
      first_name: true,
      last_name: true,
      email: true,
      avatar_url: true,
      preferred_language: true,
      is_active: true,
      roles: { where: { is_approved: true }, select: { role: true } },
    },
  });

  if (!user.is_active) {
    return apiError(403, "ACCOUNT_SUSPENDED", "Votre compte a été désactivé.");
  }

  const isNewUser = user.roles.length === 0;
  if (isNewUser) {
    await prisma.userRole.create({
      data: { user_id: user.id, role: "customer", is_approved: true, approved_at: new Date() },
    });
  }
  const roles = isNewUser ? ["customer"] : user.roles.map((r: (typeof user.roles)[number]) => r.role);

  const accessToken = await signAccessToken({ sub: user.id, phone: user.phone, roles });
  const refreshToken = await signRefreshToken(user.id);
  const expiresIn = process.env["JWT_EXPIRES_IN"] ?? "1h";
  const expiresAt = new Date(Date.now() + parseExpiresInMs(expiresIn)).toISOString();

  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    is_new_user: isNewUser,
    user: {
      id: user.id,
      phone: user.phone,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      avatar_url: user.avatar_url,
      preferred_language: user.preferred_language,
      roles,
    },
  });
}

/** Parse un format court type "1h", "30d", "300s" en millisecondes. */
function parseExpiresInMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 60 * 60 * 1000; // défaut 1h
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
  return amount * unitMs;
}
