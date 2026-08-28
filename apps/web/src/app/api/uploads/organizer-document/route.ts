/**
 * POST /api/uploads/organizer-document — Upload d'une pièce d'identité (bucket PRIVÉ).
 * multipart/form-data, champ "file". Retourne un chemin de stockage — jamais une URL publique.
 * Seul un admin peut ensuite en générer une URL signée temporaire pour la consulter.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { supabaseAdmin, ensureStorageBuckets, ORGANIZER_DOCS_BUCKET } from "@/lib/supabase-admin";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return apiError(422, "FILE_REQUIRED", "Fichier manquant (champ 'file')");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return apiError(422, "INVALID_FILE_TYPE", "Formats acceptés : JPEG, PNG, WebP, PDF");
  }
  if (file.size > MAX_BYTES) {
    return apiError(422, "FILE_TOO_LARGE", "Taille maximale : 10 Mo");
  }

  await ensureStorageBuckets();

  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  // Chemin préfixé par l'utilisateur — jamais devinable, et le bucket est privé de toute façon.
  const path = `${auth.sub}/id-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(ORGANIZER_DOCS_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true, // remplace un envoi précédent si l'organisateur soumet à nouveau
  });
  if (error) {
    return apiError(502, "UPLOAD_FAILED", "Échec de l'envoi du fichier", error.message);
  }

  return NextResponse.json({ path }, { status: 201 });
}
