/**
 * PATCH /api/admin/organizer-discount — Réduction (0-100%) sur les frais organisateur d'un
 * compte donné (par numéro de téléphone) — frais de mise en ligne, publicité, commission
 * transaction. 100 = tout gratuit pour ce compte (bêta-testeurs, promos ciblées) sans
 * devoir couper les frais pour toute la plateforme via free_period_enabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { phoneSchema } from "@vivre/utils";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const BodySchema = z.object({
  phone: phoneSchema,
  discount_percent: z.number().int().min(0).max(100),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
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

  await prisma.user.update({
    where: { id: user.id },
    data: { fee_discount_percent: parsed.data.discount_percent },
  });

  return NextResponse.json({
    message: `Réduction de ${parsed.data.discount_percent}% appliquée`,
    user: { id: user.id, phone: user.phone, first_name: user.first_name, last_name: user.last_name },
  });
}
