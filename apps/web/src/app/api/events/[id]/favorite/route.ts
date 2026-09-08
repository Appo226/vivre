/**
 * POST/DELETE /api/events/[id]/favorite — Basculer le cœur sur un événement.
 *
 * Juste une paire (utilisateur, événement) sans autre logique — la contrainte unique en
 * base (voir migration) empêche un double favori même en cas de double-clic/double requête,
 * pas seulement une vérification applicative.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }

  try {
    await prisma.eventFavorite.create({ data: { user_id: auth.sub, event_id: params.id } });
  } catch (err) {
    // Déjà favori (contrainte unique violée) — pas une erreur du point de vue de l'appelant,
    // le résultat final souhaité (favori) est déjà atteint.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
  }

  return NextResponse.json({ is_favorited: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  await prisma.eventFavorite.deleteMany({ where: { user_id: auth.sub, event_id: params.id } });

  return NextResponse.json({ is_favorited: false });
}
