/**
 * routes/uploads/index.ts — Endpoints de gestion des uploads Firebase Storage
 *
 * Endpoints :
 *   POST /uploads/avatar          — Upload avatar utilisateur (via API, multipart)
 *   POST /uploads/signed-url      — Génère une URL signée pour upload direct côté client
 *   DELETE /uploads               — Supprime un fichier du bucket
 *
 * Deux stratégies selon la taille :
 *   ≤ 2 Mo  → Upload via l'API (POST /uploads/avatar)
 *             Client → API → Firebase Storage → URL retournée → Update profil
 *
 *   > 2 Mo  → Upload direct via URL signée (POST /uploads/signed-url)
 *             Client demande URL → Client PUT directement vers Firebase → Client envoie URL à l'API
 *             Avantage : l'API n'est pas un goulot d'étranglement
 *
 * Toutes ces routes sont protégées par JWT (authenticate middleware).
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../plugins/authenticate.js";
import { uploadFile, generateUploadSignedUrl, deleteFile, type StorageFolder } from "../../services/storage.service.js";
import { prisma } from "@vivre/database";
import { z } from "zod";

/* ============================================================
 * SCHÉMAS DE VALIDATION
 * ============================================================ */

const SignedUrlBodySchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"], {
    errorMap: () => ({ message: "Type MIME invalide. Formats acceptés : jpeg, png, webp, gif" }),
  }),
  folder: z.enum(["avatars", "restaurants", "properties", "guides", "attractions", "documents"], {
    errorMap: () => ({ message: "Dossier de destination invalide" }),
  }),
  entityId: z.string().uuid("entityId doit être un UUID valide"),
});

const DeleteFileBodySchema = z.object({
  filePath: z.string().min(1, "filePath requis"),
});

/* ============================================================
 * ROUTES
 * ============================================================ */

export const uploadsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * POST /uploads/avatar — Upload avatar via l'API (multipart)
   * Taille max : 2 Mo (les avatars n'ont pas besoin d'être plus grands)
   * ============================================================ */
  app.post("/avatar", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;

    /*
     * Lire le fichier multipart.
     * Fastify multipart est configuré dans app.ts avec 10Mo max.
     * On impose 2Mo ici pour les avatars spécifiquement.
     */
    const data = await request.file({
      limits: { fileSize: 2 * 1024 * 1024 }, /* 2 Mo max pour les avatars */
    });

    if (!data) {
      return reply.status(400).send({ error: "Aucun fichier reçu", code: "NO_FILE" });
    }

    /* Lire le contenu dans un Buffer */
    const buffer = await data.toBuffer();

    /* Upload vers Firebase Storage */
    const result = await uploadFile(buffer, data.mimetype, "avatars", userId);

    /* Mettre à jour le profil avec la nouvelle URL */
    await prisma.user.update({
      where: { id: userId },
      data: { avatar_url: result.url },
    });

    return reply.status(200).send({
      url: result.url,
      size: result.size,
    });
  });

  /* ============================================================
   * POST /uploads/signed-url — URL signée pour upload direct (gros fichiers)
   * Le client uploadera directement vers Firebase Storage sans passer par l'API.
   * ============================================================ */
  app.post("/signed-url", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = SignedUrlBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Paramètres invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { mimeType, folder, entityId } = parseResult.data;

    const result = await generateUploadSignedUrl(
      mimeType,
      folder as StorageFolder,
      entityId
    );

    /*
     * Retourner :
     * - signedUrl : URL signée pour le PUT direct (expire dans 15 min)
     * - finalUrl : URL publique permanente à stocker en base après l'upload
     * - filePath : chemin dans le bucket (pour suppression future)
     */
    return reply.status(200).send(result);
  });

  /* ============================================================
   * DELETE /uploads — Supprimer un fichier du bucket
   * L'appelant doit être propriétaire du fichier (userId dans le path).
   * ============================================================ */
  app.delete("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = DeleteFileBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "filePath requis",
        code: "VALIDATION_ERROR",
      });
    }

    const { filePath } = parseResult.data;
    const userId = request.user.sub;

    /*
     * Sécurité : vérifier que le filePath appartient à l'utilisateur courant.
     * Un utilisateur ne peut supprimer que ses propres fichiers.
     * Les admins peuvent supprimer n'importe quoi (vérification rôle séparée).
     */
    if (!filePath.includes(userId) && !request.user.roles.includes("admin")) {
      return reply.status(403).send({
        error: "Vous ne pouvez supprimer que vos propres fichiers",
        code: "AUTH_FORBIDDEN",
      });
    }

    await deleteFile(filePath);

    return reply.status(200).send({ message: "Fichier supprimé" });
  });
};
