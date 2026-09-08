/**
 * GET /api/events/favorites/ids — Liste légère des IDs d'événements favoris de l'appelant.
 *
 * Séparée de GET /events?favorited=true (qui renvoie les cartes complètes, paginées) : les
 * boutons cœur affichés sur plein de cartes à la fois (accueil, recherche, détail) ont juste
 * besoin de savoir "est-ce que CET id est dans mes favoris", pas de refaire un fetch par
 * carte. Un seul appel partagé (react-query dédoublonne automatiquement les composants qui
 * l'appellent en parallèle) hydrate tous les cœurs de la page.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const favorites = await prisma.eventFavorite.findMany({
    where: { user_id: auth.sub },
    select: { event_id: true },
  });

  return NextResponse.json({ event_ids: favorites.map((f: { event_id: string }) => f.event_id) });
}
