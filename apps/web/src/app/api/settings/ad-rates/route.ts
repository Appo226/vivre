/**
 * GET /api/settings/ad-rates — Tarifs publicité actuels, publics (n'importe quel compte connecté).
 *
 * Rend le formulaire de soumission (/publicite/creer) réellement self-serve : la personne
 * voit le vrai prix avant de soumettre, pas seulement après validation admin. Séparé de
 * /api/admin/settings pour ne jamais exposer les champs sensibles (frais, délais de versement).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings } from "@/lib/platform-settings";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const settings = await getPlatformSettings();
  return NextResponse.json({
    home_feed_fcfa_per_day: settings.ad_price_home_feed_fcfa_per_day,
    browse_tile_fcfa_per_day: settings.ad_price_browse_fcfa_per_day,
  });
}
