/**
 * GET /api/public-services/[id] — Détail d'un service public (public, sans connexion).
 * Voir /api/emergency-numbers pour le contexte (route jamais portée depuis l'ancien backend).
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const service = await prisma.publicService.findFirst({
    where: { id: params.id, is_active: true },
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      phone_primary: true,
      phone_emergency: true,
      is_open_now: true,
      is_on_duty: true,
      is_24h: true,
      on_duty_until: true,
      opening_hours: true,
      category: { select: { id: true, slug: true, name_fr: true, name_en: true, icon: true, color_hex: true, is_emergency: true } },
      city: { select: { id: true, name: true } },
    },
  });

  if (!service) {
    return apiError(404, "SERVICE_NOT_FOUND", "Service introuvable");
  }

  return NextResponse.json({ service });
}
