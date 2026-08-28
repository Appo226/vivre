/**
 * POST /api/service-corrections — Signaler une erreur sur un service public.
 * Accessible sans connexion (voir "user_id: String?" — anonyme si pas de token) ;
 * connecté, on rattache le signalement pour permettre un suivi.
 * Voir /api/emergency-numbers pour le contexte (route jamais portée depuis l'ancien backend).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { verifyAccessToken, extractBearerToken } from "@/lib/jwt";

const CorrectionSchema = z.object({
  service_id: z.string().uuid(),
  correction_type: z.enum(["wrong_address", "wrong_phone", "closed", "wrong_hours", "other"]),
  description: z.string().trim().min(5).max(1000),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = CorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Données invalides");
  }

  const service = await prisma.publicService.findUnique({ where: { id: parsed.data.service_id }, select: { id: true } });
  if (!service) {
    return apiError(404, "SERVICE_NOT_FOUND", "Service introuvable");
  }

  // Signalement anonyme autorisé — on rattache juste l'utilisateur si un token valide est présent.
  const token = extractBearerToken(request.headers.get("authorization"));
  const claims = token ? await verifyAccessToken(token).catch(() => null) : null;
  const userId = claims?.sub ?? null;

  await prisma.serviceCorrection.create({
    data: {
      service_id: parsed.data.service_id,
      user_id: userId,
      correction_type: parsed.data.correction_type,
      description: parsed.data.description,
    },
  });

  return NextResponse.json({ message: "Signalement envoyé, merci !" }, { status: 201 });
}
