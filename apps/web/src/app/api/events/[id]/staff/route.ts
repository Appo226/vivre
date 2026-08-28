/**
 * POST /api/events/[id]/staff — Accorder l'accès scan à un numéro de téléphone (organisateur).
 * GET  /api/events/[id]/staff — Lister le staff actif de l'événement (organisateur).
 *
 * Pas besoin que le numéro ait déjà un compte VIVRE : quiconque se connecte avec ce
 * numéro (OTP normal) peut ensuite scanner CET événement précis, rien d'autre.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { normalizePhone } from "@vivre/utils";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const AddStaffSchema = z.object({ phone: z.string().min(6).max(20) });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { organizer_id: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé à l'organisateur de l'événement");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = AddStaffSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Numéro de téléphone invalide");
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return apiError(422, "INVALID_PHONE", "Numéro de téléphone invalide");
  }

  const existing = await prisma.eventStaff.findFirst({
    where: { event_id: params.id, phone },
  });

  const staff = existing
    ? await prisma.eventStaff.update({
        where: { id: existing.id },
        data: { revoked_at: null, added_by: auth.sub },
      })
    : await prisma.eventStaff.create({
        data: { event_id: params.id, phone, added_by: auth.sub },
      });

  return NextResponse.json(
    { message: "Accès scan accordé", staff: { id: staff.id, phone: staff.phone, created_at: staff.created_at.toISOString() } },
    { status: 201 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { organizer_id: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub && !auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé à l'organisateur de l'événement");
  }

  const staff = await prisma.eventStaff.findMany({
    where: { event_id: params.id, revoked_at: null },
    select: { id: true, phone: true, created_at: true },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    staff: staff.map((s: (typeof staff)[number]) => ({ id: s.id, phone: s.phone, created_at: s.created_at.toISOString() })),
  });
}
