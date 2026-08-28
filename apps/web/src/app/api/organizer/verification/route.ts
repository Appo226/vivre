/**
 * GET  /api/organizer/verification — Statut de vérification de l'organisateur connecté.
 * POST /api/organizer/verification — Soumettre (ou resoumettre après rejet) sa vérification.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const SubmitVerificationSchema = z.object({
  id_document_url: z.string().min(1), // chemin retourné par /api/uploads/organizer-document
  id_document_type: z.enum(["cnib", "passeport", "permis_conduire"]),
  id_document_holder_name: z.string().min(2).max(200),
  payout_provider: z.enum(["orange_money", "moov", "telecel_money", "wave"]),
  payout_phone: z.string().min(8).max(20),
  payout_account_name: z.string().min(2).max(200),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const verification = await prisma.organizerVerification.findUnique({
    where: { user_id: auth.sub },
    select: {
      status: true,
      id_document_type: true,
      payout_provider: true,
      payout_phone: true,
      rejection_reason: true,
      verified_at: true,
    },
  });

  return NextResponse.json(verification ?? { status: "unverified" });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = SubmitVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const data = parsed.data;

  const existing = await prisma.organizerVerification.findUnique({
    where: { user_id: auth.sub },
    select: { status: true },
  });
  if (existing?.status === "verified") {
    return apiError(409, "ALREADY_VERIFIED", "Votre compte est déjà vérifié");
  }
  if (existing?.status === "pending_review") {
    return apiError(409, "REVIEW_IN_PROGRESS", "Votre vérification est déjà en cours d'examen");
  }

  const verification = await prisma.organizerVerification.upsert({
    where: { user_id: auth.sub },
    update: {
      id_document_url: data.id_document_url,
      id_document_type: data.id_document_type,
      id_document_holder_name: data.id_document_holder_name,
      payout_provider: data.payout_provider,
      payout_phone: data.payout_phone,
      payout_account_name: data.payout_account_name,
      status: "pending_review",
      // Réinitialiser les traces d'un cycle de vérification précédent
      rejection_reason: null,
      name_match_confirmed: false,
      phone_call_confirmed_at: null,
    },
    create: {
      user_id: auth.sub,
      id_document_url: data.id_document_url,
      id_document_type: data.id_document_type,
      id_document_holder_name: data.id_document_holder_name,
      payout_provider: data.payout_provider,
      payout_phone: data.payout_phone,
      payout_account_name: data.payout_account_name,
      status: "pending_review",
    },
    select: { status: true },
  });

  return NextResponse.json({
    message: "Vérification soumise. Notre équipe vous appellera au numéro fourni pour confirmer votre identité.",
    status: verification.status,
  });
}
