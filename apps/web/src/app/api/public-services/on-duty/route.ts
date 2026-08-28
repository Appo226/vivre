/**
 * GET /api/public-services/on-duty?lat=&lng= — Pharmacies de garde actives (public).
 * Voir /api/emergency-numbers pour le contexte (route jamais portée depuis l'ancien backend).
 *
 * lat/lng optionnels : s'ils sont fournis, chaque pharmacie reçoit sa distance (mètres,
 * haversine) pour un tri côté client par proximité — sans ça, distance_m reste null.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { haversineMeters } from "@/lib/geo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);

  const services = await prisma.publicService.findMany({
    where: { is_active: true, is_on_duty: true, category: { slug: "pharmacy" } },
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      phone_primary: true,
      phone_emergency: true,
      is_on_duty: true,
      on_duty_until: true,
    },
  });

  const pharmacies = services
    .map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      phone_primary: s.phone_primary,
      phone_emergency: s.phone_emergency,
      is_on_duty: s.is_on_duty,
      on_duty_until: s.on_duty_until,
      distance_m: hasPosition ? Math.round(haversineMeters(lat, lng, s.latitude, s.longitude)) : null,
    }))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));

  return NextResponse.json({ pharmacies });
}
