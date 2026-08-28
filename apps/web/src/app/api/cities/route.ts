/**
 * GET  /api/cities — Liste des villes actives (public).
 * POST /api/cities — Ajouter une ville absente de la liste (self-serve, n'importe quel compte
 * connecté — typiquement un organisateur dont la ville n'apparaît pas dans le formulaire de
 * publication). Jamais bloquant : la ville est immédiatement utilisable, is_verified=false
 * sert juste de repère pour qu'un admin la relise plus tard (doublon, faute de frappe...).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";
import { apiError } from "@/lib/api-response";

export async function GET(): Promise<NextResponse> {
  const cities = await prisma.city.findMany({
    where: { is_active: true },
    select: { id: true, name: true, name_en: true, region: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ cities });
}

const CreateCitySchema = z.object({
  name: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateCitySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  // Si la ville existe déjà (même quelqu'un d'autre l'a ajoutée entre-temps), on la réutilise
  // plutôt que de heurter la contrainte unique sur name — idempotent du point de vue de l'appelant.
  const existing = await prisma.city.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true, name: true, name_en: true, region: true },
  });
  if (existing) {
    return NextResponse.json({ city: existing });
  }

  const city = await prisma.city.create({
    data: {
      name: parsed.data.name,
      region: parsed.data.region,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      is_verified: false,
      created_by_user_id: auth.sub,
    },
    select: { id: true, name: true, name_en: true, region: true },
  });

  return NextResponse.json({ city });
}
