/**
 * POST /api/auth/login — Connexion par téléphone + mot de passe.
 *
 * Remplace verify-otp comme point d'entrée principal. Protection contre le brute-force :
 * après MAX_ATTEMPTS mots de passe incorrects, le compte est verrouillé LOCKOUT_MINUTES —
 * l'équivalent de la protection qu'offrait le rate-limit OTP, mais ciblée sur ce qui peut
 * maintenant être deviné à volonté (un mot de passe ne périme jamais, contrairement à un
 * code OTP) plutôt que sur l'envoi de SMS.
 *
 * Message d'erreur volontairement identique que ce soit le téléphone OU le mot de passe
 * qui soit faux — ne jamais révéler si un numéro est enregistré (évite l'énumération de
 * comptes).
 */

import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { verifyPassword } from "@/lib/password";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const INVALID_CREDENTIALS_MESSAGE = "Numéro de téléphone ou mot de passe incorrect.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { phone, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true, phone: true, username: true, first_name: true, last_name: true,
      email: true, avatar_url: true, preferred_language: true, is_active: true, is_verified: true,
      password_hash: true, failed_login_attempts: true, login_locked_until: true,
      roles: { where: { is_approved: true }, select: { role: true } },
    },
  });

  if (!user) {
    return apiError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
  }

  if (user.login_locked_until && user.login_locked_until > new Date()) {
    const minutesLeft = Math.ceil((user.login_locked_until.getTime() - Date.now()) / 60_000);
    return apiError(429, "ACCOUNT_LOCKED", `Trop de tentatives échouées. Réessayez dans ${minutesLeft} min.`);
  }

  if (!user.is_active) {
    return apiError(403, "ACCOUNT_SUSPENDED", "Votre compte a été désactivé.");
  }

  if (!user.password_hash) {
    // Compte créé avant le passage au mot de passe (ancien flux OTP) — pas de mot de
    // passe à comparer. Message distinct : dire "mot de passe incorrect" serait trompeur.
    return apiError(
      409,
      "PASSWORD_NOT_SET",
      "Ce compte n'a pas encore de mot de passe. Contactez le support pour le configurer."
    );
  }

  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    const attempts = user.failed_login_attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: locked ? 0 : attempts,
        ...(locked && { login_locked_until: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }),
      },
    });
    if (locked) {
      return apiError(429, "ACCOUNT_LOCKED", `Trop de tentatives échouées. Réessayez dans ${LOCKOUT_MINUTES} min.`);
    }
    return apiError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failed_login_attempts: 0, login_locked_until: null, last_login_at: new Date() },
  });

  const roles = user.roles.map((r: { role: string }) => r.role);
  const accessToken = await signAccessToken({ sub: user.id, phone: user.phone, roles });
  const refreshToken = await signRefreshToken(user.id);

  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
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
