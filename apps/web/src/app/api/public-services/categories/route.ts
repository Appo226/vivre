/**
 * GET /api/public-services/categories — Catégories de services publics (public, sans connexion).
 * Voir /api/emergency-numbers pour le contexte (route jamais portée depuis l'ancien backend).
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";

export async function GET(): Promise<NextResponse> {
  const categories = await prisma.publicServiceCategory.findMany({
    where: { is_active: true },
    select: {
      id: true,
      slug: true,
      name_fr: true,
      name_en: true,
      icon: true,
      color_hex: true,
      is_emergency: true,
      sort_order: true,
    },
    orderBy: { sort_order: "asc" },
  });
  return NextResponse.json({ categories });
}
