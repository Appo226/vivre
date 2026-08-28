/**
 * POST /api/auth/register — Création de compte par téléphone + mot de passe.
 *
 * Remplace l'OTP comme point d'entrée principal pour l'authentification — voir
 * signAccessToken plus bas, même schéma de token que l'ancien flux OTP, donc tout le reste
 * de l'app (middleware, rôles, refresh) continue de fonctionner sans changement.
 *
 * Le numéro de téléphone N'EST PAS bloquant à l'inscription — le compte est utilisable
 * immédiatement (login, navigation) même non vérifié, pour ne pas ajouter de friction à
 * l'onboarding. Mais is_verified démarre à false et un OTP de vérification est envoyé
 * dans la foulée : c'est ce qui empêche quelqu'un d'utiliser le numéro de quelqu'un
 * d'autre pour réserver un billet (voir le check is_verified dans events/bookings) —
 * la vérification doit avoir eu lieu AVANT qu'une réservation soit possible, pas avant
 * l'inscription elle-même.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { hashPassword } from "@/lib/password";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { sendOtpCode } from "@/lib/otp-channel";

const VERIFY_OTP_EXPIRES_SECONDS = 300;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { username, first_name, last_name, phone, password, email } = parsed.data;

  const existingPhone = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existingPhone) {
    return apiError(409, "PHONE_TAKEN", "Un compte existe déjà avec ce numéro — connectez-vous plutôt.");
  }

  const existingUsername = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existingUsername) {
    return apiError(409, "USERNAME_TAKEN", "Ce nom d'utilisateur est déjà pris");
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingEmail) {
      return apiError(409, "EMAIL_TAKEN", "Cette adresse email est déjà utilisée par un autre compte");
    }
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      phone,
      username,
      first_name,
      last_name,
      password_hash,
      is_verified: false, // vérifié par OTP — voir l'envoi juste après la création
      ...(email && { email }),
      roles: { create: { role: "customer", is_approved: true, approved_at: new Date() } },
    },
    select: {
      id: true, phone: true, username: true, first_name: true, last_name: true,
      email: true, avatar_url: true, preferred_language: true, is_verified: true,
      roles: { select: { role: true } },
    },
  });

  const roles = user.roles.map((r: { role: string }) => r.role);
  const accessToken = await signAccessToken({ sub: user.id, phone: user.phone, roles });
  const refreshToken = await signRefreshToken(user.id);

  const code = generateCode();
  await prisma.otpCode.create({
    data: {
      phone: user.phone,
      code,
      purpose: "verify",
      user_id: user.id,
      expires_at: new Date(Date.now() + VERIFY_OTP_EXPIRES_SECONDS * 1000),
    },
  });
  let devCode: string | null = null;
  try {
    const result = await sendOtpCode(user.phone, code);
    devCode = result.devCode;
  } catch {
    // Ne bloque pas la création de compte si l'envoi échoue (ex: panne SMS passagère) —
    // l'utilisateur peut redemander un code via /api/auth/verify-phone/send.
  }

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
    ...(devCode && { dev_code: devCode }),
  });
}
