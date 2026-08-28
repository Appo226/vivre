/**
 * POST /api/uploads/avatar — Upload une photo de profil (bucket public event-media,
 * préfixe "avatars/" — même bucket que les visuels d'événements, même niveau de
 * confiance : contenu public par nature).
 * multipart/form-data, champ "file". Retourne l'URL publique à envoyer à PATCH /auth/me.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { supabaseAdmin, ensureStorageBuckets, EVENT_MEDIA_BUCKET } from "@/lib/supabase-admin";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return apiError(422, "FILE_REQUIRED", "Fichier manquant (champ 'file')");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return apiError(422, "INVALID_FILE_TYPE", "Formats acceptés : JPEG, PNG, WebP");
  }
  if (file.size > MAX_BYTES) {
    return apiError(422, "FILE_TOO_LARGE", "Taille maximale : 5 Mo");
  }

  await ensureStorageBuckets();

  const ext = file.type.split("/")[1];
  const path = `avatars/${auth.sub}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(EVENT_MEDIA_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (error) {
    return apiError(502, "UPLOAD_FAILED", "Échec de l'envoi du fichier", error.message);
  }

  const { data } = supabaseAdmin.storage.from(EVENT_MEDIA_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
