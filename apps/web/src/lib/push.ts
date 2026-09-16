/**
 * lib/push.ts — Envoi effectif des notifications push via FCM.
 *
 * Appelé depuis notify() (lib/notifications.ts) pour chaque notification in-app créée —
 * un seul point d'entrée, tous les appelants existants (transfert de billet, événement
 * modifié, remboursement...) obtiennent le push gratuitement, sans toucher leur code.
 *
 * Auto-nettoyage : un token FCM devient invalide quand l'utilisateur désinstalle l'app,
 * réinitialise les permissions, ou change de navigateur. FCM le signale via un code
 * d'erreur précis (registration-token-not-registered / invalid-argument) — on supprime
 * alors la ligne DeviceToken correspondante pour ne plus jamais retenter dessus, plutôt que
 * d'accumuler des tokens morts qui ralentissent chaque envoi futur.
 */

import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@vivre/database";
import { firebaseAdminApp } from "@/lib/firebase-admin";

interface PushInput {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export async function sendPush({ userId, title, body, data }: PushInput): Promise<void> {
  if (!firebaseAdminApp) return; /* Firebase pas configuré — voir firebase-admin.ts */

  const devices = await prisma.deviceToken.findMany({
    where: { user_id: userId },
    select: { token: true },
  });
  if (devices.length === 0) return;

  try {
    const response = await getMessaging(firebaseAdminApp).sendEachForMulticast({
      tokens: devices.map((d: { token: string }) => d.token),
      notification: { title, body },
      ...(data && { data }),
      webpush: {
        notification: { icon: "/icons/icon-192x192.png", badge: "/icons/badge-72x72.png" },
        ...(data?.["deepLink"] && { fcmOptions: { link: data["deepLink"] } }),
      },
    });

    const deadTokens = response.responses
      .map((r, i) => (!r.success && DEAD_TOKEN_CODES.has(r.error?.code ?? "") ? devices[i]!.token : null))
      .filter((t): t is string => t !== null);

    if (deadTokens.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: deadTokens } } });
    }
  } catch (err) {
    console.error(`[push] Échec envoi FCM pour user ${userId}:`, err);
  }
}
