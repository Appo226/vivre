/**
 * lib/notifications.ts — Création de notifications in-app.
 *
 * Un seul point d'entrée pour écrire dans la table notifications, appelé depuis chaque
 * endroit où quelque chose arrive à une personne (billet transféré, événement approuvé,
 * remboursement traité...). channel="push" par défaut : le centre de notifications
 * (/profile/notifications) est le seul canal réellement branché pour l'instant — pas
 * d'envoi FCM ici, juste l'enregistrement que la personne verra en ouvrant l'app.
 *
 * Ne doit jamais faire échouer l'action principale (transfert, approbation...) si l'écriture
 * échoue — une notification manquée est un désagrément, pas une erreur bloquante.
 */

import { prisma } from "@vivre/database";

export type NotificationType =
  | "ticket_transferred"
  | "ticket_transfer_accepted"
  | "ticket_transfer_declined"
  | "event_updated"
  | "event_cancelled"
  | "refund_processed"
  | "refund_rejected"
  | "event_approved"
  | "event_rejected"
  | "payout_sent"
  | "ad_approved"
  | "ad_rejected"
  | "event_reminder";

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function notify({ userId, type, title, body, data }: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        user_id: userId,
        type,
        title,
        body,
        channel: "push",
        ...(data && { data }),
      },
    });
  } catch (err) {
    console.error(`[notify] Échec création notification (${type}) pour user ${userId}:`, err);
  }
}
