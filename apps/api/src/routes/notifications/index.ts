/**
 * routes/notifications/index.ts — Notifications in-app VIVRE
 *
 * POST /notifications/device-token
 *   Enregistre ou met à jour le token FCM d'un appareil.
 *   Appelé par le frontend après connexion + accord des permissions push.
 *   Un user peut avoir plusieurs tokens (web + téléphone).
 *
 * GET /notifications
 *   Retourne les notifications in-app de l'utilisateur (historique).
 *   Tri par date décroissante, pagination par curseur.
 *
 * PATCH /notifications/read-all
 *   Marque toutes les notifications non lues comme lues.
 *
 * PATCH /notifications/:id/read
 *   Marque une notification spécifique comme lue.
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {

  /* ----------------------------------------------------------
   * POST /notifications/device-token
   * Upsert du token FCM — si le token existe déjà (même appareil),
   * on met à jour le user_id associé. Si c'est un nouveau token, on crée.
   * ---------------------------------------------------------- */
  app.post("/device-token", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const body   = request.body as Record<string, unknown>;
    const token    = body["token"]    as string | undefined;
    const platform = body["platform"] as string | undefined;

    if (!token || !platform) {
      return reply.status(422).send({
        error: "token et platform sont requis",
        code:  "VALIDATION_ERROR",
      });
    }

    if (!["web", "android", "ios"].includes(platform)) {
      return reply.status(422).send({
        error: "platform doit être web, android ou ios",
        code:  "VALIDATION_ERROR",
      });
    }

    /*
     * Upsert : si le token existe déjà (ex: l'appareil s'est reconnecté),
     * on met à jour le user_id. Cela gère le cas où un utilisateur se déconnecte
     * et qu'un autre se connecte sur le même appareil.
     */
    await prisma.deviceToken.upsert({
      where:  { token },
      create: { user_id: userId, token, platform },
      update: { user_id: userId, platform },
    });

    return reply.status(200).send({ message: "Token enregistré" });
  });

  /* ----------------------------------------------------------
   * DELETE /notifications/device-token
   * Supprime le token FCM à la déconnexion — arrête les notifications.
   * ---------------------------------------------------------- */
  app.delete("/device-token", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const body  = request.body as Record<string, unknown>;
    const token = body["token"] as string | undefined;

    if (!token) {
      return reply.status(422).send({ error: "token requis", code: "VALIDATION_ERROR" });
    }

    await prisma.deviceToken.deleteMany({
      where: { token, user_id: request.user.sub },
    });

    return reply.status(200).send({ message: "Token supprimé" });
  });

  /* ----------------------------------------------------------
   * GET /notifications
   * Historique des notifications de l'utilisateur.
   * Pagination par cursor (sent_at + id) pour l'infinite scroll.
   * ---------------------------------------------------------- */
  app.get("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const query  = request.query as Record<string, string | undefined>;
    const limit  = Math.min(Number(query["limit"] ?? 20), 50);
    const cursor = query["cursor"]; /* ISO datetime du dernier élément chargé */

    const notifications = await prisma.notification.findMany({
      where: {
        user_id: userId,
        ...(cursor ? { sent_at: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { sent_at: "desc" },
      take:    limit + 1, /* +1 pour savoir s'il y a une page suivante */
      select: {
        id: true, type: true, title: true, body: true,
        is_read: true, sent_at: true, data: true,
      },
    });

    const hasMore = notifications.length > limit;
    const items   = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1]?.sent_at?.toISOString() : null;

    /* Nombre de non-lues pour le badge */
    const unreadCount = await prisma.notification.count({
      where: { user_id: userId, is_read: false },
    });

    return reply.send({ notifications: items, unread_count: unreadCount, next_cursor: nextCursor });
  });

  /* ----------------------------------------------------------
   * PATCH /notifications/read-all
   * Marque toutes les notifications non lues comme lues.
   * Appelé quand l'utilisateur ouvre le panneau de notifications.
   * ---------------------------------------------------------- */
  app.patch("/read-all", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    await prisma.notification.updateMany({
      where: { user_id: request.user.sub, is_read: false },
      data:  { is_read: true, read_at: new Date() },
    });

    return reply.send({ message: "Toutes les notifications marquées comme lues" });
  });

  /* ----------------------------------------------------------
   * PATCH /notifications/:id/read
   * Marque une notification individuelle comme lue.
   * ---------------------------------------------------------- */
  app.patch("/:id/read", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };

    await prisma.notification.updateMany({
      where: { id, user_id: request.user.sub },
      data:  { is_read: true, read_at: new Date() },
    });

    return reply.send({ message: "Notification lue" });
  });
}
