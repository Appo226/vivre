/**
 * lib/firebase-admin.ts — SDK Firebase Admin côté serveur (envoi des push FCM).
 *
 * Contrepartie serveur de lib/firebase.ts (client). Initialisé depuis
 * FIREBASE_SERVICE_ACCOUNT_JSON — le JSON du compte de service Firebase, encodé en base64
 * (voir .env.production.example : `base64 -i serviceAccountKey.json | tr -d '\n'`), pour
 * éviter les soucis d'échappement de newlines qu'a la clé privée PEM dans un .env brut.
 *
 * Même politique d'échec silencieux que côté client : les push ne sont pas critiques, un
 * projet Firebase pas encore configuré ne doit jamais faire échouer notify().
 */

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";

function getFirebaseAdminApp(): App | null {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const encoded = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!encoded) return null;

  try {
    const serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
    return initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON invalide :", err);
    return null;
  }
}

export const firebaseAdminApp = getFirebaseAdminApp();
