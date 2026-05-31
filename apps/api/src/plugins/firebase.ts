/**
 * plugins/firebase.ts — Initialisation du SDK Firebase Admin
 *
 * Firebase Admin est utilisé côté API pour deux services :
 *   1. Firebase Storage — stockage des médias (photos profil, images restaurants, etc.)
 *      Remplace AWS S3. Avantage pour les startups : crédits Google, SDK simple,
 *      intégration native avec Firebase Auth si on l'ajoute plus tard.
 *
 *   2. Firebase Cloud Messaging (FCM) — envoi de notifications push.
 *      Les tokens FCM des appareils sont stockés en base (UserDevice.fcm_token).
 *      L'API envoie les notifs via Admin SDK (pas besoin d'exposer les clés côté client).
 *
 * Authentification :
 *   En production : variable GOOGLE_APPLICATION_CREDENTIALS pointant vers le JSON
 *   du compte de service, OU FIREBASE_SERVICE_ACCOUNT_JSON (JSON inline en base64).
 *   En développement : Application Default Credentials (gcloud auth application-default login).
 *
 * Singleton : Firebase Admin ne doit être initialisé qu'une seule fois par process.
 * Ce module exporte l'instance initialisée — les services (storage, messaging) l'utilisent.
 */

import admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";

/* ============================================================
 * INITIALISATION SINGLETON
 * initializeApp() doit être appelée UNE SEULE FOIS au démarrage.
 * On vérifie apps.length pour éviter "app already exists" au hot-reload.
 * ============================================================ */

function initFirebase(): admin.app.App | null {
  /* Déjà initialisé (hot-reload en dev) — retourner l'instance existante */
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const bucket = process.env["FIREBASE_STORAGE_BUCKET"];
  const serviceAccountJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];

  /* Skip si le JSON est le placeholder ou vide */
  if (
    serviceAccountJson &&
    serviceAccountJson !== "CHANGE_ME_BASE64_ENCODED_SERVICE_ACCOUNT_JSON"
  ) {
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountJson, "base64").toString("utf-8")
      ) as admin.ServiceAccount;
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(bucket && bucket !== "CHANGE_ME.appspot.com" ? { storageBucket: bucket } : {}),
      });
    } catch (e) {
      console.warn("[Firebase] Service account JSON invalide — Firebase désactivé.", e);
      return null;
    }
  }

  /* Tenter ADC uniquement si GOOGLE_APPLICATION_CREDENTIALS est définie */
  if (process.env["GOOGLE_APPLICATION_CREDENTIALS"]) {
    try {
      return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        ...(bucket && bucket !== "CHANGE_ME.appspot.com" ? { storageBucket: bucket } : {}),
      });
    } catch (e) {
      console.warn("[Firebase] ADC indisponible — Firebase désactivé.", e);
      return null;
    }
  }

  console.warn("[Firebase] Aucune credential configurée — Firebase désactivé.");
  return null;
}

/* Instance Firebase Admin — null si credentials non configurées */
export const firebaseAdmin = initFirebase();

/* Bucket et Messaging — null si Firebase n'est pas initialisé */
export const storageBucket: Bucket | null = firebaseAdmin
  ? firebaseAdmin.storage().bucket()
  : null;

export const firebaseMessaging: admin.messaging.Messaging | null = firebaseAdmin
  ? firebaseAdmin.messaging()
  : null;
