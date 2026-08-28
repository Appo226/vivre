/**
 * GET /api/public-services?category_slug=&lat=&lng=&page=&limit= — Liste des services publics
 * (public, sans connexion). Voir /api/emergency-numbers pour le contexte (route jamais
 * portée depuis l'ancien backend).
 *
 * Tri : par distance si lat/lng fournis (haversine, calculé en mémoire — le volume par
 * ville reste petit, pas besoin de PostGIS pour l'instant), sinon alphabétique.
 * Pagination simple "page pleine ⇒ peut-être une suivante" (voir getNextPageParam côté page).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { haversineMeters } from "@/lib/geo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const categorySlug = params.get("category_slug") ?? undefined;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));

  const services = await prisma.publicService.findMany({
    where: {
      is_active: true,
      ...(categorySlug && { category: { slug: categorySlug } }),
    },
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
      category: { select: { id: true, slug: true, name_fr: true, icon: true, color_hex: true } },
    },
  });

  const withDistance = services.map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    phone_primary: s.phone_primary,
    phone_emergency: s.phone_emergency,
    is_open_now: s.is_open_now,
    is_on_duty: s.is_on_duty,
    is_24h: s.is_24h,
    on_duty_until: s.on_duty_until,
    category_id: s.category.id,
    category_slug: s.category.slug,
    category_name_fr: s.category.name_fr,
    category_icon: s.category.icon,
    category_color_hex: s.category.color_hex,
    distance_m: hasPosition ? Math.round(haversineMeters(lat, lng, s.latitude, s.longitude)) : null,
  }));

  withDistance.sort((a, b) =>
    hasPosition ? (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity) : a.name.localeCompare(b.name)
  );

  const start = (page - 1) * limit;
  const pageItems = withDistance.slice(start, start + limit);

  return NextResponse.json({ services: pageItems, page, limit });
}
