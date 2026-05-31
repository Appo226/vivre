/**
 * services/notification.service.ts — Notifications VIVRE
 *
 * Deux canaux de livraison :
 *   SMS  — Twilio. Toujours livré (pas besoin d'app installée).
 *          Utilisé pour les confirmations critiques : commande payée,
 *          billet émis, réservation confirmée.
 *   Push — Firebase Cloud Messaging (FCM). Riche et silencieux.
 *          Utilisé pour les mises à jour en cours : "en préparation",
 *          "livreur en route", etc.
 *
 * STRATÉGIE PAR ÉVÉNEMENT :
 *   - Paiement confirmé         → SMS + Push (critique)
 *   - Commande confirmée        → Push seul (informatif)
 *   - Commande en préparation   → Push seul
 *   - Commande prête            → SMS + Push (client doit se déplacer si pickup)
 *   - Livreur en route          → Push seul
 *   - Commande livrée           → Push seul
 *   - Commande annulée          → SMS + Push (critique)
 *
 * RESILIENCE :
 *   Les erreurs d'envoi sont loggées mais ne font PAS échouer la requête
 *   principale. Une notification non envoyée ne doit jamais bloquer
 *   une mise à jour de statut.
 *
 * FIREBASE INIT :
 *   Firebase Admin SDK s'initialise une seule fois (pattern singleton).
 *   Les credentials viennent des variables d'environnement.
 */

import twilio from "twilio";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@vivre/database";

/* ============================================================
 * INIT SINGLETONS
 * ============================================================ */

/**
 * Client Twilio — initialisé une seule fois.
 * Retourne null si les credentials sont absents (dev sans Twilio configuré).
 */
function getTwilioClient(): ReturnType<typeof twilio> | null {
  const sid   = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token || sid === "CHANGE_ME") return null;
  return twilio(sid, token);
}

/**
 * Firebase Admin SDK — pattern singleton.
 * Peut être appelé plusieurs fois sans risque — initializeApp est idempotent.
 */
function initFirebase(): void {
  if (getApps().length > 0) return; /* Déjà initialisé */

  const projectId   = process.env["FIREBASE_PROJECT_ID"];
  const privateKey  = process.env["FIREBASE_PRIVATE_KEY"]?.replace(/\\n/g, "\n");
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];

  if (!projectId || !privateKey || !clientEmail) return; /* Dev sans Firebase configuré */

  initializeApp({
    credential: cert({ projectId, privateKey, clientEmail }),
  });
}

/* ============================================================
 * TYPES
 * ============================================================ */

interface SendSmsParams {
  to:      string;  /* Format E.164 : +226XXXXXXXX */
  message: string;
}

interface SendPushParams {
  userId:  string;
  title:   string;
  body:    string;
  data?:   Record<string, string>; /* Données pour le deep link (screen, id, etc.) */
}

interface NotificationRecord {
  userId:  string;
  type:    string;
  title:   string;
  body:    string;
  channel: string;
  data?:   Record<string, string>;
}

/* ============================================================
 * PRIMITIVES — SMS ET PUSH
 * ============================================================ */

/**
 * Envoie un SMS via Twilio.
 * Ne lève pas d'erreur si Twilio n'est pas configuré (dev/test).
 */
async function sendSms(params: SendSmsParams): Promise<void> {
  const client = getTwilioClient();
  const from   = process.env["TWILIO_PHONE_NUMBER"];

  if (!client || !from) {
    /* En dev sans Twilio, logguer le SMS dans la console */
    console.log(`[SMS DEV] → ${params.to} : ${params.message}`);
    return;
  }

  await client.messages.create({
    to:   params.to,
    from,
    body: params.message,
  });
}

/**
 * Envoie une notification push Firebase FCM à tous les appareils d'un user.
 * Récupère les device tokens depuis la base, envoie en parallèle.
 * Les tokens invalides sont supprimés automatiquement.
 */
async function sendPush(params: SendPushParams): Promise<void> {
  initFirebase();

  if (getApps().length === 0) {
    /* Firebase non configuré en dev */
    console.log(`[PUSH DEV] → user ${params.userId} : ${params.title} — ${params.body}`);
    return;
  }

  /* Charger tous les tokens FCM de cet utilisateur */
  const deviceTokens = await prisma.deviceToken.findMany({
    where:  { user_id: params.userId },
    select: { id: true, token: true },
  });

  if (deviceTokens.length === 0) return;

  const messaging = getMessaging();

  /* Envoyer à tous les appareils en parallèle */
  const results = await Promise.allSettled(
    deviceTokens.map((dt) =>
      messaging.send({
        token: dt.token,
        notification: { title: params.title, body: params.body },
        /* data doit être Record<string, string> pour FCM */
        ...(params.data ? { data: params.data } : {}),
        webpush: {
          notification: {
            title: params.title,
            body:  params.body,
            icon:  "/icons/icon-192x192.png",
            badge: "/icons/badge-72x72.png",
          },
          fcmOptions: { link: params.data?.["url"] ?? "/" },
        },
      })
    )
  );

  /*
   * Supprimer les tokens FCM invalides (expired ou révoqués).
   * FCM retourne "messaging/registration-token-not-registered" pour les tokens morts.
   */
  const expiredTokenIds = deviceTokens
    .filter((_, i) => {
      const r = results[i];
      return r?.status === "rejected" &&
        String((r as PromiseRejectedResult).reason).includes("registration-token-not-registered");
    })
    .map((dt) => dt.id);

  if (expiredTokenIds.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { id: { in: expiredTokenIds } } });
  }
}

/**
 * Persiste la notification dans la base pour l'historique in-app.
 * Ne bloque jamais l'appelant — les erreurs DB sont loggées silencieusement.
 */
async function recordNotification(params: NotificationRecord): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        user_id: params.userId,
        type:    params.type,
        title:   params.title,
        body:    params.body,
        channel: params.channel,
        /* Prisma Json? ne supporte pas null explicite avec exactOptionalPropertyTypes */
        ...(params.data ? { data: params.data } : {}),
      },
    });
  } catch {
    /* Silencieux — l'historique n'est pas critique */
  }
}

/* ============================================================
 * HELPERS MÉTIER — appelés depuis les routes
 * ============================================================ */

/**
 * Paiement confirmé → commande/réservation active.
 * Canal : SMS + Push (critique — le client doit savoir que son argent est parti).
 */
export async function notifyPaymentConfirmed(params: {
  userId:      string;
  userPhone:   string;
  amountFcfa:  number;
  bookingType: string;
  bookingId:   string;
}): Promise<void> {
  const typeLabel: Record<string, string> = {
    food:      "commande",
    property:  "réservation hébergement",
    transport: "billet de transport",
    event:     "billet événement",
  };
  const label   = typeLabel[params.bookingType] ?? "paiement";
  const title   = "Paiement confirmé ✅";
  const body    = `Votre ${label} de ${params.amountFcfa.toLocaleString()} FCFA est confirmée.`;
  const urlMap: Record<string, string> = {
    food:      `/food/mes-commandes/${params.bookingId}`,
    property:  `/hebergement/mes-reservations/${params.bookingId}`,
    transport: `/transport/mes-billets/${params.bookingId}`,
    event:     `/evenements/mes-billets/${params.bookingId}`,
  };

  await Promise.allSettled([
    sendSms({ to: params.userPhone, message: `VIVRE : ${body}` }),
    sendPush({ userId: params.userId, title, body, data: { url: urlMap[params.bookingType] ?? "/" } }),
    recordNotification({ userId: params.userId, type: "payment_confirmed", title, body, channel: "sms+push", data: { booking_id: params.bookingId } }),
  ]);
}

/**
 * Statut d'une commande food mis à jour.
 * Chaque statut a son propre message et sa propre stratégie de canal.
 */
export async function notifyOrderStatus(params: {
  userId:    string;
  userPhone: string;
  orderId:   string;
  status:    string;
  restaurantName: string;
}): Promise<void> {
  /* Messages et canaux par statut */
  const config: Record<string, { title: string; body: string; sms: boolean }> = {
    confirmed: {
      title: "Commande confirmée 👨‍🍳",
      body:  `${params.restaurantName} a accepté votre commande et commence la préparation.`,
      sms:   false,
    },
    preparing: {
      title: "En préparation 🍳",
      body:  `Votre commande chez ${params.restaurantName} est en cours de préparation.`,
      sms:   false,
    },
    ready: {
      title: "Commande prête ! 🎉",
      body:  `Votre commande est prête — le livreur arrive bientôt.`,
      sms:   true,  /* SMS car le client doit parfois se préparer à recevoir */
    },
    picked_up: {
      title: "Livreur en route 🛵",
      body:  `Votre livreur est en route avec votre commande.`,
      sms:   false,
    },
    delivered: {
      title: "Commande livrée ✅",
      body:  `Votre commande a été livrée. Bon appétit !`,
      sms:   false,
    },
    cancelled: {
      title: "Commande annulée ❌",
      body:  `Votre commande chez ${params.restaurantName} a été annulée.`,
      sms:   true,  /* SMS car l'annulation est critique — rembourser ? */
    },
  };

  const cfg = config[params.status];
  if (!cfg) return; /* Statut sans notification (ex: pending_payment) */

  const data = { url: `/food/mes-commandes/${params.orderId}`, order_id: params.orderId };

  await Promise.allSettled([
    cfg.sms ? sendSms({ to: params.userPhone, message: `VIVRE : ${cfg.body}` }) : Promise.resolve(),
    sendPush({ userId: params.userId, title: cfg.title, body: cfg.body, data }),
    recordNotification({ userId: params.userId, type: `order_${params.status}`, title: cfg.title, body: cfg.body, channel: cfg.sms ? "sms+push" : "push", data }),
  ]);
}

/**
 * Réservation hébergement confirmée ou rejetée par l'hôtel.
 */
export async function notifyPropertyBookingStatus(params: {
  userId:       string;
  userPhone:    string;
  bookingId:    string;
  propertyName: string;
  status:       "confirmed" | "cancelled";
}): Promise<void> {
  const isConfirmed = params.status === "confirmed";
  const title = isConfirmed ? "Réservation confirmée ✅" : "Réservation annulée ❌";
  const body  = isConfirmed
    ? `Votre séjour chez ${params.propertyName} est confirmé.`
    : `Votre réservation chez ${params.propertyName} a été annulée.`;

  await Promise.allSettled([
    sendSms({ to: params.userPhone, message: `VIVRE : ${body}` }),
    sendPush({ userId: params.userId, title, body, data: { url: `/hebergement/mes-reservations/${params.bookingId}` } }),
    recordNotification({ userId: params.userId, type: `property_booking_${params.status}`, title, body, channel: "sms+push" }),
  ]);
}

/**
 * Changement de statut d'une course zémidjan / taxi.
 * Push uniquement — la course est suivie via SSE en temps réel.
 * Ce push sert de fallback si l'app est en arrière-plan.
 */
export async function notifyRideStatus(params: {
  userId: string;
  rideId: string;
  status: "accepted" | "arrived" | "completed" | "cancelled";
}): Promise<void> {
  const config: Record<string, { title: string; body: string }> = {
    accepted:  { title: "Chauffeur en route 🛵", body: "Votre chauffeur a accepté la course et arrive vers vous." },
    arrived:   { title: "Chauffeur arrivé ! 📍", body: "Votre chauffeur vous attend au point de départ." },
    completed: { title: "Course terminée ✅",    body: "Course terminée — merci de procéder au paiement." },
    cancelled: { title: "Course annulée ❌",     body: "Votre course a été annulée par le chauffeur." },
  };

  const cfg = config[params.status];
  if (!cfg) return;

  const data: Record<string, string> = { url: `/course/${params.rideId}`, ride_id: params.rideId };

  await Promise.allSettled([
    sendPush({ userId: params.userId, title: cfg.title, body: cfg.body, data }),
    recordNotification({ userId: params.userId, type: `ride_${params.status}`, title: cfg.title, body: cfg.body, channel: "push" }),
  ]);
}

/**
 * Annulation d'une réservation avec information sur le remboursement.
 * SMS + Push (critique — l'argent est concerné).
 */
export async function notifyBookingCancelled(params: {
  userId:       string;
  userPhone:    string;
  bookingType:  "transport" | "property" | "food" | "event";
  bookingId:    string;
  refundAmount: number;
  refundMethod: string | null;
}): Promise<void> {
  const typeLabel: Record<string, string> = {
    transport: "billet de bus",
    property:  "réservation hôtel",
    food:      "commande",
    event:     "billet événement",
  };
  const label = typeLabel[params.bookingType] ?? "réservation";
  const feminine = params.bookingType === "property" || params.bookingType === "event";
  const title = "Annulation confirmée ❌";
  const body = params.refundAmount > 0
    ? `Votre ${label} a été annulé${feminine ? "e" : ""}. Remboursement de ${params.refundAmount.toLocaleString()} FCFA ${params.refundMethod === "vivre_credit" ? "crédité sur votre portefeuille VIVRE" : "en cours de traitement (24–48h)"}.`
    : `Votre ${label} a été annulé${feminine ? "e" : ""}.`;

  const urlMap: Record<string, string> = {
    transport: `/transport/mes-billets/${params.bookingId}`,
    property:  `/hebergement/mes-reservations/${params.bookingId}`,
    food:      `/food/mes-commandes/${params.bookingId}`,
    event:     `/evenements/mes-billets/${params.bookingId}`,
  };

  await Promise.allSettled([
    sendSms({ to: params.userPhone, message: `VIVRE : ${body}` }),
    sendPush({ userId: params.userId, title, body, data: { url: urlMap[params.bookingType] ?? "/" } }),
    recordNotification({ userId: params.userId, type: `${params.bookingType}_cancelled`, title, body, channel: "sms+push" }),
  ]);
}

/**
 * Nouvelle livraison assignée à un livreur.
 * Push uniquement — le livreur a l'app ouverte quand il est disponible.
 */
export async function notifyDriverNewDelivery(params: {
  driverUserId:    string;
  orderId:         string;
  restaurantName:  string;
  deliveryAddress: string;
}): Promise<void> {
  const title = "Nouvelle livraison 📦";
  const body  = `${params.restaurantName} → ${params.deliveryAddress}`;

  await Promise.allSettled([
    sendPush({ userId: params.driverUserId, title, body, data: { url: `/food/mes-commandes/${params.orderId}`, order_id: params.orderId } }),
    recordNotification({ userId: params.driverUserId, type: "driver_new_delivery", title, body, channel: "push" }),
  ]);
}
