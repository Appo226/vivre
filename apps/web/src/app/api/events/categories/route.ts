/**
 * GET /api/events/categories — Liste des catégories d'événements (public).
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";

export async function GET(): Promise<NextResponse> {
  const categories = await prisma.eventCategory.findMany({
    where: { is_active: true },
    select: { id: true, name: true, name_en: true, icon: true, color_hex: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ categories });
}
