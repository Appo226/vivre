/**
 * lib/supabase-admin.ts — Client Supabase côté serveur (service role — jamais exposé au navigateur).
 * Utilisé pour le Storage : bucket privé pour les pièces d'identité, bucket public pour les
 * photos/affiches d'événements.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis");
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

export const ORGANIZER_DOCS_BUCKET = "organizer-documents"; // privé
export const EVENT_MEDIA_BUCKET = "event-media"; // public
export const AD_CREATIVE_BUCKET = "ad-creative"; // public — images ET vidéos courtes

let bucketsEnsured = false;

/** Crée les buckets requis s'ils n'existent pas encore — idempotent, sûr à appeler à chaque requête. */
export async function ensureStorageBuckets(): Promise<void> {
  if (bucketsEnsured) return;
  const { data: existing } = await supabaseAdmin.storage.listBuckets();
  const names = new Set((existing ?? []).map((b: { name: string }) => b.name));

  if (!names.has(ORGANIZER_DOCS_BUCKET)) {
    await supabaseAdmin.storage.createBucket(ORGANIZER_DOCS_BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });
  }
  if (!names.has(EVENT_MEDIA_BUCKET)) {
    await supabaseAdmin.storage.createBucket(EVENT_MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  }
  if (!names.has(AD_CREATIVE_BUCKET)) {
    // Limite fichier au niveau bucket = le plafond le plus large qu'on accepte (vidéo) —
    // la validation par type précise (image vs vidéo, avec leurs propres plafonds) se fait
    // dans la route d'upload, avant même d'arriver ici.
    await supabaseAdmin.storage.createBucket(AD_CREATIVE_BUCKET, {
      public: true,
      fileSizeLimit: "20MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
    });
  }
  bucketsEnsured = true;
}
