/**
 * lib/notifications.ts — Création de notifications in-app + push FCM.
 *
 * Un seul point d'entrée pour signaler que quelque chose arrive à une personne (billet
 * transféré, événement approuvé, remboursement traité...) : écrit dans la table
 * notifications (toujours visible dans /profile/notifications) ET déclenche l'envoi push
 * FCM vers ses appareils enregistrés (voir lib/push.ts) — no-op silencieux si l'utilisateur
 * n'a aucun device_token ou si Firebase n'est pas configuré.
 *
 * Ne doit jamais faire échouer l'action principale (transfert, approbation...) si l'écriture
 * ou l'envoi échoue — une notification manquée est un désagrément, pas une erreur bloquante.
 */

import { prisma } from "@vivre/database";
import { sendPush } from "@/lib/push";

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
  | "event_reminder"
  // Alerte opérationnelle admin — un PaymentAttempt reste non résolu (ni complété ni échoué de
  // façon authentique) au-delà de PAYMENT_REVIEW_AFTER_HOURS, ou une double complétion a été
  // détectée. Voir lib/payments/orchestrator.ts. N'est jamais envoyée à un acheteur/organisateur.
  | "payment_needs_review";

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

  /* Best-effort, en parallèle — un push raté ne doit jamais faire échouer notify() */
  void sendPush({ userId, title, body, ...(data && { data }) }).catch(() => {});
}
