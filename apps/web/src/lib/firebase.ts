/**
 * lib/firebase.ts — Initialisation du SDK Firebase côté client (web/PWA)
 *
 * Ce fichier initialise Firebase pour deux fonctions :
 *   1. Firebase Storage — téléchargement direct de fichiers depuis le navigateur
 *      (pour les uploads gros fichiers via URL signée générée par l'API)
 *
 *   2. Firebase Cloud Messaging (FCM) — réception des notifications push.
 *      Le Service Worker (firebase-messaging-sw.js) gère les notifs en background.
 *      Ce fichier gère les notifs en foreground et l'obtention du token FCM.
 *
 * Singleton : Firebase ne doit être initialisé qu'une fois.
 * On utilise getApps() pour éviter les réinitialisations lors du hot-reload Next.js.
 *
 * Variables d'environnement requises (NEXT_PUBLIC_* = exposées côté client) :
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *   NEXT_PUBLIC_FIREBASE_VAPID_KEY  (pour les notifications web push)
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getStorage } from "firebase/storage";

/* ============================================================
 * CONFIGURATION
 * Toutes les valeurs sont publiques (côté client) — pas de secrets ici.
 * La sécurité est assurée par les Firebase Security Rules, pas par les clés.
 * ============================================================ */

const firebaseConfig = {
  apiKey:            process.env["NEXT_PUBLIC_FIREBASE_API_KEY"] ?? "",
  authDomain:        process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"] ?? "",
  projectId:         process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] ?? "",
  storageBucket:     process.env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"] ?? "",
  messagingSenderId: process.env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
  appId:             process.env["NEXT_PUBLIC_FIREBASE_APP_ID"] ?? "",
};

/* ============================================================
 * INITIALISATION SINGLETON
 * ============================================================ */

function getFirebaseApp(): FirebaseApp {
  /* getApps() retourne [] si aucune app initialisée — évite le double-init */
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0]!;
  }
  return initializeApp(firebaseConfig);
}

export const firebaseApp = getFirebaseApp();

/* Firebase Storage — pour les uploads directs (gros fichiers) */
export const firebaseStorage = getStorage(firebaseApp);

/* ============================================================
 * FIREBASE CLOUD MESSAGING — TOKEN FCM
 * Chargé dynamiquement pour éviter les erreurs côté serveur (SSR).
 * FCM nécessite window.navigator et un Service Worker — pas disponibles en SSR.
 * ============================================================ */

/**
 * Obtient le token FCM de l'appareil courant.
 * Ce token est envoyé à l'API pour être stocké dans UserDevice.fcm_token.
 *
 * Conditions requises :
 * - Permission notifications accordée par l'utilisateur
 * - Service Worker firebase-messaging-sw.js enregistré
 * - NEXT_PUBLIC_FIREBASE_VAPID_KEY configuré
 *
 * @returns Token FCM string, ou null si les conditions ne sont pas remplies
 */
export async function getFcmToken(): Promise<string | null> {
  /* Guard : FCM n'est disponible que côté client */
  if (typeof window === "undefined") return null;

  /* Vérifier la permission de notifications */
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  try {
    /*
     * Import dynamique de firebase/messaging pour éviter qu'il soit bundlé
     * dans le chunk initial (économise ~50KB). FCM n'est utile qu'après
     * que l'utilisateur a accordé la permission.
     */
    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(firebaseApp);

    const vapidKey = process.env["NEXT_PUBLIC_FIREBASE_VAPID_KEY"];
    const swRegistration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/firebase-cloud-messaging-push-scope" }
    );

    /*
     * Avec exactOptionalPropertyTypes, on ne peut pas passer `vapidKey: undefined`.
     * On spread l'option conditionnellement pour l'omettre si la var env est absente.
     */
    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
      ...(vapidKey && { vapidKey }),
    });

    return token;
  } catch (err) {
    /* FCM peut échouer si l'app est en iframe, si les cookies sont bloqués, etc. */
    console.error("[FCM] Erreur obtention token :", err);
    return null;
  }
}

/**
 * Écoute les notifications FCM reçues en FOREGROUND (app ouverte).
 * Les notifications en background sont gérées par firebase-messaging-sw.js.
 *
 * @param onMessage - Callback appelé avec le payload de la notification
 * @returns Fonction pour stopper l'écoute (unsubscribe)
 */
export async function onForegroundMessage(
  onMessage: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void
): Promise<() => void> {
  if (typeof window === "undefined") return () => { /* noop SSR */ };

  const { getMessaging, onMessage: fcmOnMessage } = await import("firebase/messaging");
  const messaging = getMessaging(firebaseApp);

  /* onMessage retourne une fonction "unsubscribe" */
  return fcmOnMessage(messaging, onMessage);
}
