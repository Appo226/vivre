/**
 * POST /api/uploads/event-media — Upload une photo/affiche d'événement (bucket public).
 * multipart/form-data, champ "file". Retourne l'URL publique à stocker dans cover_url/gallery_urls.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { supabaseAdmin, ensureStorageBuckets, EVENT_MEDIA_BUCKET } from "@/lib/supabase-admin";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
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
    return apiError(422, "INVALID_FILE_TYPE", "Formats acceptés : JPEG, PNG, WebP");
  }
  if (file.size > MAX_BYTES) {
    return apiError(422, "FILE_TOO_LARGE", "Taille maximale : 10 Mo");
  }

  await ensureStorageBuckets();

  const ext = file.type.split("/")[1];
  const path = `${auth.sub}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(EVENT_MEDIA_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return apiError(502, "UPLOAD_FAILED", "Échec de l'envoi du fichier", error.message);
  }

  const { data } = supabaseAdmin.storage.from(EVENT_MEDIA_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
