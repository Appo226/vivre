/**
 * services/storage.service.ts — Upload de médias vers Firebase Storage
 *
 * Remplace AWS S3. Firebase Storage offre :
 *   - SDK Admin simple (pas de configuration IAM complexe)
 *   - URLs signées pour upload direct depuis le client (sans passer par l'API)
 *   - Intégration native avec Firebase Security Rules (contrôle accès par UID)
 *   - CDN Google intégré (Google Cloud CDN)
 *
 * Deux stratégies d'upload selon le cas d'usage :
 *   1. Upload via l'API (petit fichier, ex: avatar) :
 *      Client → API → Firebase Storage → URL publique retournée
 *
 *   2. Upload direct (gros fichier, ex: image restaurant) :
 *      Client demande une URL signée → Client upload directement → Client envoie l'URL à l'API
 *      Avantage : l'API n'est pas un goulot d'étranglement pour les gros fichiers.
 *
 * Organisation des dossiers dans le bucket :
 *   avatars/{userId}/{filename}
 *   restaurants/{restaurantId}/{filename}
 *   properties/{propertyId}/{filename}
 *   guides/{guideId}/{filename}
 *   attractions/{attractionId}/{filename}
 */

import { storageBucket } from "../plugins/firebase.js";
import { randomUUID } from "crypto";
import { Readable } from "stream";

/* ============================================================
 * TYPES
 * ============================================================ */

export type StorageFolder =
  | "avatars"
  | "restaurants"
  | "properties"
  | "guides"
  | "attractions"
  | "documents";

export interface UploadResult {
  /** URL publique permanente de l'image (CDN Google) */
  url: string;
  /** Chemin relatif dans le bucket (pour suppression future) */
  path: string;
  /** Taille du fichier en octets */
  size: number;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/* Types MIME autorisés pour les images */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/* Taille max par fichier : 10 Mo */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* Durée de validité des URLs signées pour upload direct (15 min) */
const SIGNED_URL_EXPIRY_MINUTES = 15;

/* ============================================================
 * UPLOAD VIA L'API (stream)
 * ============================================================ */

/**
 * Upload un fichier vers Firebase Storage depuis l'API.
 * Utilisé pour les petits fichiers (avatars, thumbnails).
 *
 * @param buffer - Contenu du fichier (Buffer ou Readable stream)
 * @param mimeType - Type MIME (ex: "image/jpeg")
 * @param folder - Dossier de destination dans le bucket
 * @param entityId - ID de l'entité associée (userId, restaurantId, etc.)
 * @returns URL publique et métadonnées
 * @throws Error si type non autorisé ou taille dépassée
 */
export async function uploadFile(
  buffer: Buffer,
  mimeType: string,
  folder: StorageFolder,
  entityId: string
): Promise<UploadResult> {
  if (!storageBucket) {
    throw new Error("Firebase Storage non configuré. Renseignez FIREBASE_SERVICE_ACCOUNT_JSON.");
  }
  /* Validation type MIME */
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Type de fichier non autorisé : ${mimeType}. Types acceptés : jpeg, png, webp, gif.`);
  }

  /* Validation taille */
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`Fichier trop volumineux (${Math.round(buffer.byteLength / 1024 / 1024)} Mo). Maximum : 10 Mo.`);
  }

  /* Générer un nom de fichier unique pour éviter les collisions */
  const extension = mimeType.split("/")[1] ?? "jpg";
  const filename = `${randomUUID()}.${extension}`;
  const filePath = `${folder}/${entityId}/${filename}`;

  /* Upload vers Firebase Storage */
  const file = storageBucket.file(filePath);
  const stream = Readable.from(buffer);

  await new Promise<void>((resolve, reject) => {
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
        /*
         * Cache-Control long : les images ne changent pas (on génère un nouveau nom
         * à chaque upload). CDN peut les cacher agressivement.
         */
        cacheControl: "public, max-age=31536000",
      },
      /* Rendre le fichier public immédiatement */
      public: true,
      resumable: false, /* Pas de resumable upload pour les petits fichiers */
    });

    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  /*
   * Construire l'URL publique du CDN Google.
   * Format : https://storage.googleapis.com/{bucketName}/{filePath}
   * Disponible immédiatement après upload (pas de délai de propagation).
   */
  const bucketName = storageBucket.name;
  const url = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  return { url, path: filePath, size: buffer.byteLength };
}

/* ============================================================
 * URL SIGNÉE POUR UPLOAD DIRECT (gros fichiers)
 * ============================================================ */

/**
 * Génère une URL signée permettant au client d'uploader directement
 * vers Firebase Storage sans passer par l'API.
 *
 * Flow :
 *   1. Client appelle POST /upload/signed-url avec {folder, entityId, mimeType}
 *   2. API retourne {signedUrl, filePath, finalUrl}
 *   3. Client PUT le fichier vers signedUrl (Content-Type doit correspondre)
 *   4. Client envoie finalUrl à l'API pour mettre à jour la ressource
 *
 * @param mimeType - Type MIME du fichier à uploader
 * @param folder - Dossier de destination
 * @param entityId - ID de l'entité
 * @returns URL signée (valable SIGNED_URL_EXPIRY_MINUTES minutes) + URL finale publique
 */
export async function generateUploadSignedUrl(
  mimeType: string,
  folder: StorageFolder,
  entityId: string
): Promise<{ signedUrl: string; filePath: string; finalUrl: string }> {
  if (!storageBucket) {
    throw new Error("Firebase Storage non configuré.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Type de fichier non autorisé : ${mimeType}`);
  }

  const extension = mimeType.split("/")[1] ?? "jpg";
  const filename = `${randomUUID()}.${extension}`;
  const filePath = `${folder}/${entityId}/${filename}`;
  const file = storageBucket.file(filePath);

  /* Générer l'URL signée pour PUT (upload direct) */
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + SIGNED_URL_EXPIRY_MINUTES * 60 * 1000,
    contentType: mimeType,
  });

  /* URL publique finale (accessible après l'upload) */
  const finalUrl = `https://storage.googleapis.com/${storageBucket.name}/${filePath}`;

  return { signedUrl, filePath, finalUrl };
}

/* ============================================================
 * SUPPRESSION D'UN FICHIER
 * ============================================================ */

/**
 * Supprime un fichier du bucket Firebase Storage.
 * Utilisé quand un utilisateur remplace son avatar ou supprime une image.
 *
 * @param filePath - Chemin relatif dans le bucket (ex: "avatars/userId/uuid.jpg")
 */
export async function deleteFile(filePath: string): Promise<void> {
  if (!storageBucket) return;
  const file = storageBucket.file(filePath);

  try {
    await file.delete();
  } catch (err) {
    /*
     * Si le fichier n'existe pas (déjà supprimé ou chemin invalide),
     * on logue mais on ne throw pas — l'idempotence est préférable.
     */
    const error = err as { code?: number };
    if (error.code !== 404) {
      throw err;
    }
  }
}
