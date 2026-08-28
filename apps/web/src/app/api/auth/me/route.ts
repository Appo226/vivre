/**
 * GET   /api/auth/me — Profil de l'utilisateur connecté.
 * PATCH /api/auth/me — Modifier son propre profil (nom, email, avatar, langue).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";
import { apiError } from "@/lib/api-response";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: {
      id: true,
      phone: true,
      email: true,
      username: true,
      first_name: true,
      last_name: true,
      avatar_url: true,
      preferred_language: true,
      is_verified: true,
      created_at: true,
      roles: { where: { is_approved: true }, select: { role: true } },
    },
  });

  if (!user) {
    return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable");
  }

  return NextResponse.json({
    id: user.id,
    phone: user.phone,
    email: user.email,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    avatar_url: user.avatar_url,
    preferred_language: user.preferred_language,
    is_verified: user.is_verified,
    roles: user.roles.map((r: (typeof user.roles)[number]) => r.role),
    created_at: user.created_at.toISOString(),
  });
}

/* Lettres/chiffres/underscore, 3–20 caractères — normalisé en minuscules avant stockage
   pour éviter que "Awa" et "awa" soient traités comme deux identités distinctes. */
const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3 à 20 caractères : lettres, chiffres, underscore uniquement");

const UpdateMeSchema = z.object({
  username: UsernameSchema.nullable().optional(),
  first_name: z.string().trim().min(1).max(100).nullable().optional(),
  last_name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  preferred_language: z.enum(["fr", "en"]).optional(),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdateMeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  // exactOptionalPropertyTypes interdit les clés explicitement `undefined` dans l'input Prisma —
  // ne garder que les champs réellement fournis (même motif que PATCH /api/admin/settings).
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(changes).length === 0) {
    return apiError(422, "VALIDATION_ERROR", "Aucun champ à modifier");
  }

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id: auth.sub },
      data: changes,
      select: {
        id: true, phone: true, email: true, username: true, first_name: true, last_name: true,
        avatar_url: true, preferred_language: true,
        roles: { where: { is_approved: true }, select: { role: true } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // meta.target liste la/les colonne(s) en conflit — distingue email vs username,
      // les deux étant @unique sur le même modèle.
      const target = (err.meta?.["target"] as string[] | string | undefined) ?? "";
      if (target.includes("username")) {
        return apiError(409, "USERNAME_TAKEN", "Ce nom d'utilisateur est déjà pris");
      }
      return apiError(409, "EMAIL_TAKEN", "Cette adresse email est déjà utilisée par un autre compte");
    }
    throw err;
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      phone: updated.phone,
      email: updated.email,
      username: updated.username,
      first_name: updated.first_name,
      last_name: updated.last_name,
      avatar_url: updated.avatar_url,
      preferred_language: updated.preferred_language,
      roles: updated.roles.map((r: (typeof updated.roles)[number]) => r.role),
    },
  });
}
