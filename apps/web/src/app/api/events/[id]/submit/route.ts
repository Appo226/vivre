/**
 * PATCH /api/events/[id]/submit — Soumettre un événement.
 *
 * Règle du lancement (voir schema.prisma section 12) :
 * - Si TOUS les types de billets sont gratuits (price_fcfa = 0 partout) → approbation
 *   automatique, publication immédiate. Aucune friction pour les petits organisateurs.
 * - S'il y a au moins un billet payant → passe en "pending_approval", un admin doit
 *   approuver/rejeter avant publication (garde-fou sur les événements où l'argent circule).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      organizer_id: true,
      status: true,
      cover_url: true,
      gallery_urls: true,
      latitude: true,
      longitude: true,
      ticket_types: { select: { price_fcfa: true } },
    },
  });

  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (!["draft", "rejected"].includes(event.status)) {
    return apiError(409, "INVALID_STATUS_TRANSITION", `Un événement en statut "${event.status}" ne peut pas être soumis`);
  }
  if (event.ticket_types.length === 0) {
    return apiError(409, "NO_TICKET_TYPES", "Ajoutez au moins un type de billet avant de soumettre");
  }

  // Au moins 3 visuels (photos ou affiches) — signal de confiance minimal, exigé de tous
  const photoCount = (event.cover_url ? 1 : 0) + event.gallery_urls.length;
  if (photoCount < 3) {
    return apiError(
      409,
      "NOT_ENOUGH_PHOTOS",
      `Ajoutez au moins 3 photos ou affiches avant de soumettre (${photoCount}/3 actuellement)`
    );
  }
  if (event.latitude === null || event.longitude === null) {
    return apiError(409, "LOCATION_REQUIRED", "Le lieu exact de l'événement doit être positionné sur la carte");
  }

  const isFullyFree = event.ticket_types.every((tt: (typeof event.ticket_types)[number]) => tt.price_fcfa === 0);

  // Événement payant → l'organisateur doit être vérifié (pièce d'identité + appel confirmé)
  // avant toute mise en vente de billets payants. Les événements gratuits restent sans friction.
  if (!isFullyFree) {
    const verification = await prisma.organizerVerification.findUnique({
      where: { user_id: auth.sub },
      select: { status: true },
    });
    if (verification?.status !== "verified") {
      return apiError(
        403,
        "ORGANIZER_NOT_VERIFIED",
        "Votre compte doit être vérifié (pièce d'identité + appel de confirmation) avant de publier un événement payant. Complétez votre vérification dans votre profil organisateur.",
        { verification_status: verification?.status ?? "unverified" }
      );
    }
  }

  if (isFullyFree) {
    await prisma.event.update({
      where: { id },
      data: { status: "approved", approved_at: new Date() },
    });
    return NextResponse.json({
      message: "Événement gratuit — publié immédiatement, aucune approbation requise.",
      event_id: id,
      status: "approved",
    });
  }

  await prisma.event.update({ where: { id }, data: { status: "pending_approval" } });
  return NextResponse.json({
    message: "Événement avec billets payants soumis pour approbation. Notre équipe répond sous 48h.",
    event_id: id,
    status: "pending_approval",
  });
}
