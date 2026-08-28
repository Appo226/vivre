/**
 * GET /api/settings/greeting — Message d'accueil chaleureux (n'importe quel compte connecté).
 *
 * Volontairement séparé de /api/admin/settings : cette route n'expose que le message et son
 * interrupteur, pas les champs sensibles (frais, délais de versement) réservés aux admins.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings } from "@/lib/platform-settings";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const settings = await getPlatformSettings();
  return NextResponse.json({
    message: settings.greeting_message,
    enabled: settings.greeting_message_enabled,
  });
}
