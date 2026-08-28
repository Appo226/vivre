/**
 * /api/admin/team — Gestion des administrateurs (super_admin uniquement).
 *
 * GET  : liste des comptes ayant le rôle "admin" ou "super_admin".
 * POST : accorde le rôle "admin" à un compte existant (par numéro de téléphone).
 *
 * "super_admin" n'est JAMAIS accordable ici, volontairement — même un compte admin
 * compromis ne peut pas se créer un pair super_admin par cette route. Ce rôle ne se
 * pose que hors-app, directement en base, par la personne qui détient l'accès à la
 * base de données (voir scripts/grant-super-admin.mjs).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { phoneSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const GrantSchema = z.object({ phone: phoneSchema });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("super_admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé au super-administrateur");
  }

  const roles = await prisma.userRole.findMany({
    where: { role: { in: ["admin", "super_admin"] } },
    select: {
      role: true,
      approved_at: true,
      user: { select: { id: true, phone: true, first_name: true, last_name: true } },
    },
    orderBy: { approved_at: "asc" },
  });

  type RoleRow = (typeof roles)[number];
  /* Un même compte peut porter admin + super_admin — regrouper par utilisateur. */
  const byUser = new Map<string, { id: string; phone: string; first_name: string | null; last_name: string | null; roles: string[]; since: Date | null }>();
  for (const r of roles as RoleRow[]) {
    const existing = byUser.get(r.user.id);
    if (existing) {
      existing.roles.push(r.role);
    } else {
      byUser.set(r.user.id, {
        id: r.user.id,
        phone: r.user.phone,
        first_name: r.user.first_name,
        last_name: r.user.last_name,
        roles: [r.role],
        since: r.approved_at,
      });
    }
  }

  return NextResponse.json({
    team: Array.from(byUser.values()).map((u) => ({ ...u, since: u.since?.toISOString() ?? null })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("super_admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé au super-administrateur");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = GrantSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Numéro de téléphone invalide", parsed.error.errors[0]?.message);
  }

  const user = await prisma.user.findUnique({
    where: { phone: parsed.data.phone },
    select: { id: true, phone: true, first_name: true, last_name: true },
  });
  if (!user) {
    return apiError(
      404,
      "USER_NOT_FOUND",
      "Aucun compte avec ce numéro — la personne doit d'abord se connecter une fois sur VIVRE."
    );
  }

  const existing = await prisma.userRole.findUnique({
    where: { user_id_role: { user_id: user.id, role: "admin" } },
  });
  if (existing) {
    return apiError(409, "ALREADY_ADMIN", "Ce compte est déjà administrateur");
  }

  await prisma.userRole.create({
    data: { user_id: user.id, role: "admin", is_approved: true, approved_at: new Date(), approved_by: auth.sub },
  });

  return NextResponse.json({
    message: "Rôle administrateur accordé",
    user: { id: user.id, phone: user.phone, first_name: user.first_name, last_name: user.last_name },
  });
}
