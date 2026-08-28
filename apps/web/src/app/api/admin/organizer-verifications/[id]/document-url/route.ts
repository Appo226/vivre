/**
 * GET /api/admin/organizer-verifications/[id]/document-url — URL signée temporaire (5 min)
 * vers la pièce d'identité stockée dans le bucket privé. Jamais d'URL publique/permanente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { supabaseAdmin, ORGANIZER_DOCS_BUCKET } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const verification = await prisma.organizerVerification.findUnique({
    where: { id: params.id },
    select: { id_document_url: true },
  });
  if (!verification?.id_document_url) {
    return apiError(404, "DOCUMENT_NOT_FOUND", "Aucune pièce d'identité associée");
  }

  const { data, error } = await supabaseAdmin.storage
    .from(ORGANIZER_DOCS_BUCKET)
    .createSignedUrl(verification.id_document_url, 300); // 5 minutes

  if (error || !data) {
    return apiError(502, "SIGNED_URL_FAILED", "Impossible de générer l'URL de consultation", error?.message);
  }

  return NextResponse.json({ url: data.signedUrl, expires_in: 300 });
}
