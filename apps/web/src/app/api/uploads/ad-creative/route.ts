/**
 * POST /api/uploads/ad-creative — Upload un visuel publicitaire, image OU vidéo courte
 * (bucket public dédié — voir AD_CREATIVE_BUCKET).
 *
 * Vidéo : MP4 uniquement (pas WebM) — délibéré, pas une limitation technique de départ.
 * La durée (≤15s) est vérifiée deux fois : côté client avant l'envoi (readVideoDuration
 * dans publicite/creer/page.tsx, pour un retour immédiat), ET ici, côté serveur, en lisant
 * l'atome mvhd du conteneur MP4 directement (voir lib/mp4-duration.ts) — sans ffmpeg, sans
 * décodage vidéo. C'est la vraie barrière : la vérification client peut être contournée en
 * appelant cette route directement, celle-ci ne peut pas. Un seul format vidéo accepté
 * exprès, pour que CE contrôle s'applique à tout ce qu'on accepte, plutôt que d'avoir un
 * format vérifié et un autre qui ne l'est pas.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { supabaseAdmin, ensureStorageBuckets, AD_CREATIVE_BUCKET } from "@/lib/supabase-admin";
import { getMp4DurationSeconds } from "@/lib/mp4-duration";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 15;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return apiError(422, "FILE_REQUIRED", "Fichier manquant (champ 'file')");
  }

  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return apiError(422, "INVALID_FILE_TYPE", "Formats acceptés : JPEG, PNG, WebP (image) ou MP4 (vidéo)");
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return apiError(422, "FILE_TOO_LARGE", isVideo ? "Taille maximale pour une vidéo : 20 Mo" : "Taille maximale pour une image : 10 Mo");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isVideo) {
    const duration = getMp4DurationSeconds(bytes);
    // Refuse par défaut si la durée n'a pas pu être lue — mieux vaut rejeter un MP4 valide
    // mais mal structuré que laisser passer une vidéo dont on ne peut pas prouver la durée.
    if (duration === null) {
      return apiError(422, "VIDEO_UNREADABLE", "Impossible de lire ce fichier MP4 — réexportez-le et réessayez");
    }
    if (duration > MAX_VIDEO_SECONDS) {
      return apiError(422, "VIDEO_TOO_LONG", `Vidéo trop longue (${Math.round(duration)}s) — ${MAX_VIDEO_SECONDS}s maximum`);
    }
  }

  await ensureStorageBuckets();

  const ext = file.type.split("/")[1];
  const path = `${auth.sub}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabaseAdmin.storage.from(AD_CREATIVE_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return apiError(502, "UPLOAD_FAILED", "Échec de l'envoi du fichier", error.message);
  }

  const { data } = supabaseAdmin.storage.from(AD_CREATIVE_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, media_type: isVideo ? "video" : "image" }, { status: 201 });
}
