/**
 * GET /api/geocode?q=... — Proxy vers Nominatim (OpenStreetMap), géocodage gratuit.
 *
 * On proxy côté serveur plutôt que d'appeler Nominatim directement depuis le navigateur :
 * leur politique d'usage exige un User-Agent identifiant l'application, ce qu'un fetch()
 * client ne peut pas garantir de façon fiable. Aucune clé API, aucun coût.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 3) {
    return apiError(422, "VALIDATION_ERROR", "Paramètre q requis (minimum 3 caractères)");
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "bf"); // Burkina Faso — évite les faux positifs hors zone

  const response = await fetch(url, {
    headers: { "User-Agent": "VIVRE-billetterie/1.0 (contact@vivrebf.com)" },
  });

  if (!response.ok) {
    return apiError(502, "GEOCODE_FAILED", "Échec de la recherche de lieu");
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;

  return NextResponse.json({
    results: results.map((r) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lon),
      display_name: r.display_name,
    })),
  });
}
