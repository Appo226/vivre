/**
 * services/notifications.service.ts — Envoi de notifications push via Firebase FCM
 *
 * Firebase Cloud Messaging (FCM) est le service de push notifications Google.
 * Il gère l'envoi vers Android (natif), iOS (APNs bridge) et web (Service Worker).
 *
 * Pour VIVRE, les notifications couvrent :
 *   - Confirmation de réservation (transport, hôtel, guide)
 *   - Mise à jour de statut (chauffeur en route, commande préparée, etc.)
 *   - Promotions et offres spéciales (opt-in uniquement)
 *   - Alertes urgence (signalement service public fermé, etc.)
 *
 * Les tokens FCM sont stockés en base dans UserDevice.fcm_token.
 * Un utilisateur peut avoir plusieurs appareils (téléphone + tablette).
 *
 * Quota FCM : 1 million de messages/mois gratuits — largement suffisant au lancement.
 */

import { firebaseMessaging } from "../plugins/firebase.js";
import type { MulticastMessage, Message } from "firebase-admin/messaging";

/* ============================================================
 * TYPES
 * ============================================================ */

export interface NotificationPayload {
  title: string;
  body: string;
  /** URL de l'image à afficher dans la notification (optionnel) */
  imageUrl?: string;
  /** Données custom accessibles dans le handler SW (clés/valeurs string) */
  data?: Record<string, string>;
  /** Deep link vers l'écran concerné dans l'app (ex: "/transport/booking/123") */
  deepLink?: string;
}

export interface SendResult {
  successCount: number;
  failureCount: number;
  /** Tokens FCM invalides à retirer de la base */
  invalidTokens: string[];
}

/* ============================================================
 * ENVOI À UN SEUL APPAREIL
 * ============================================================ */

/**
 * Envoie une notification push à un appareil via son token FCM.
 *
 * @param fcmToken - Token FCM de l'appareil (depuis UserDevice.fcm_token)
 * @param notification - Contenu de la notification
 */
export async function sendToDevice(
  fcmToken: string,
  notification: NotificationPayload
): Promise<void> {
  if (!firebaseMessaging) return; /* Firebase non configuré en dev */
  const message: Message = {
    token: fcmToken,
    notification: {
      title: notification.title,
      body: notification.body,
      ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
    },
    data: {
      ...(notification.data ?? {}),
      /* Le deepLink est injecté dans data pour que le Service Worker
         puisse naviguer vers le bon écran au tap de la notification */
      ...(notification.deepLink && { deepLink: notification.deepLink }),
    },
    /*
     * Android : priorité haute pour les notifications urgentes (transport, urgences).
     * Si notification.data.priority = "normal", FCM la diffère pour économiser la batterie.
     */
    android: {
      priority: "high",
      notification: {
        sound: "default",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    /*
     * Web (Service Worker) : les notifications web suivent les standards Push API.
     * VAPID key requis côté client pour s'abonner.
     */
    webpush: {
      notification: {
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        vibrate: [200, 100, 200],
      },
      fcmOptions: {
        ...(notification.deepLink && { link: notification.deepLink }),
      },
    },
  };

  await firebaseMessaging.send(message);
}

/* ============================================================
 * ENVOI MULTICAST (plusieurs appareils d'un même utilisateur)
 * ============================================================ */

/**
 * Envoie une notification à plusieurs appareils simultanément.
 * Utilisé quand un utilisateur a plusieurs tokens FCM (multi-device).
 *
 * FCM gère 500 tokens max par requête multicast — on chunk automatiquement.
 *
 * @param fcmTokens - Liste de tokens FCM
 * @param notification - Contenu de la notification
 * @returns Résultat avec tokens invalides à purger de la base
 */
export async function sendToDevices(
  fcmTokens: string[],
  notification: NotificationPayload
): Promise<SendResult> {
  if (fcmTokens.length === 0 || !firebaseMessaging) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const FCM_CHUNK_SIZE = 500; /* Limite FCM par requête multicast */
  const invalidTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  /* Découper en chunks de 500 tokens max */
  for (let i = 0; i < fcmTokens.length; i += FCM_CHUNK_SIZE) {
    const chunk = fcmTokens.slice(i, i + FCM_CHUNK_SIZE);

    const message: MulticastMessage = {
      tokens: chunk,
      notification: {
        title: notification.title,
        body: notification.body,
        ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
      },
      data: {
        ...(notification.data ?? {}),
        ...(notification.deepLink && { deepLink: notification.deepLink }),
      },
      android: { priority: "high" },
      webpush: {
        notification: { icon: "/icons/icon-192x192.png" },
        ...(notification.deepLink && { fcmOptions: { link: notification.deepLink } }),
      },
    };

    const response = await firebaseMessaging.sendEachForMulticast(message);
    successCount += response.successCount;
    failureCount += response.failureCount;

    /*
     * Identifier les tokens invalides pour les purger de la base.
     * FCM retourne UNREGISTERED ou INVALID_ARGUMENT quand un token est périmé
     * (l'utilisateur a désinstallé l'app ou réinstallé sans re-demander la permission).
     */
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/registration-token-not-registered" ||
          resp.error?.code === "messaging/invalid-registration-token")
      ) {
        const token = chunk[idx];
        if (token) invalidTokens.push(token);
      }
    });
  }

  return { successCount, failureCount, invalidTokens };
}

/* ============================================================
 * ENVOI À UN TOPIC (broadcast)
 * ============================================================ */

/**
 * Envoie une notification à tous les abonnés d'un topic FCM.
 * Topics disponibles : "urgences", "promotions", "transport-{cityId}"
 *
 * Les utilisateurs s'abonnent/désabonnent via la fonction subscribeToTopic().
 *
 * @param topic - Nom du topic (ex: "urgences-ouagadougou")
 * @param notification - Contenu de la notification
 */
export async function sendToTopic(
  topic: string,
  notification: NotificationPayload
): Promise<void> {
  if (!firebaseMessaging) return;
  const message: Message = {
    topic,
    notification: {
      title: notification.title,
      body: notification.body,
      ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
    },
    data: {
      ...(notification.data ?? {}),
      ...(notification.deepLink && { deepLink: notification.deepLink }),
    },
    android: { priority: "high" },
    webpush: {
      notification: { icon: "/icons/icon-192x192.png" },
    },
  };

  await firebaseMessaging.send(message);
}

/* ============================================================
 * GESTION DES ABONNEMENTS AUX TOPICS
 * ============================================================ */

/**
 * Abonne un ou plusieurs tokens FCM à un topic.
 * Appeler après que l'utilisateur active les notifications pour une catégorie.
 */
export async function subscribeToTopic(fcmTokens: string[], topic: string): Promise<void> {
  if (!firebaseMessaging) return;
  await firebaseMessaging.subscribeToTopic(fcmTokens, topic);
}

/**
 * Désabonne un ou plusieurs tokens FCM d'un topic.
 * Appeler quand l'utilisateur désactive les notifications d'une catégorie.
 */
export async function unsubscribeFromTopic(fcmTokens: string[], topic: string): Promise<void> {
  if (!firebaseMessaging) return;
  await firebaseMessaging.unsubscribeFromTopic(fcmTokens, topic);
}
