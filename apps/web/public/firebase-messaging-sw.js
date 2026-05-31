/**
 * firebase-messaging-sw.js — Service Worker Firebase Cloud Messaging
 *
 * Ce Service Worker gère les notifications push reçues quand l'application
 * est en ARRIÈRE-PLAN (background) ou fermée.
 *
 * Les notifications en foreground (app ouverte) sont gérées par onForegroundMessage()
 * dans src/lib/firebase.ts.
 *
 * IMPORTANT : Ce fichier DOIT être à la racine de /public/ pour être accessible
 * à l'URL /firebase-messaging-sw.js (le scope FCM l'exige).
 *
 * Les clés Firebase sont injectées via __FIREBASE_CONFIG__ (voir next.config.js).
 * En production, ce fichier est servi statiquement par Next.js/Nginx.
 *
 * Deep links : quand l'utilisateur tape la notification, le SW ouvre
 * l'URL définie dans data.deepLink (ex: /transport/booking/123).
 */

/* Importer Firebase Messaging compat (v8 compat — requis pour les SW) */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

/*
 * Configuration Firebase injectée par next.config.js (FirebaseSwConfigPlugin).
 * Ce fichier est généré à chaque build dans public/firebase-config.js.
 * Il définit self.FIREBASE_CONFIG avec les vraies valeurs des variables d'env.
 * Les clés Firebase sont publiques (sécurité assurée par Security Rules).
 */
try { importScripts("/firebase-config.js"); } catch (e) { /* fichier absent en dev */ }

const firebaseConfig = self.FIREBASE_CONFIG ?? {
  apiKey: "", authDomain: "", projectId: "",
  storageBucket: "", messagingSenderId: "", appId: "",
};

/* Initialiser Firebase dans le contexte du Service Worker */
firebase.initializeApp(firebaseConfig);

/* Obtenir l'instance Messaging */
const messaging = firebase.messaging();

/* ============================================================
 * GESTION DES NOTIFICATIONS EN BACKGROUND
 * setBackgroundMessageHandler est appelé quand une data-only message arrive
 * (pas de notification affichée automatiquement par FCM).
 * Pour les notification messages, FCM affiche automatiquement la notif.
 * ============================================================ */
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification ?? {};
  const data = payload.data ?? {};

  /* Afficher la notification avec les options custom VIVRE */
  self.registration.showNotification(notification.title ?? "VIVRE", {
    body:    notification.body ?? "",
    icon:    "/icons/icon-192x192.png",
    badge:   "/icons/badge-72x72.png",
    image:   notification.image,
    vibrate: [200, 100, 200],
    /* Stocker le deepLink pour la gestion du clic */
    data: { deepLink: data["deepLink"] ?? "/" },
    actions: [
      { action: "open", title: "Ouvrir" },
      { action: "dismiss", title: "Ignorer" },
    ],
  });
});

/* ============================================================
 * GESTION DU CLIC SUR LA NOTIFICATION
 * Ouvre l'app et navigue vers le deepLink si défini.
 * ============================================================ */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const deepLink = event.notification.data?.deepLink ?? "/";
  const url = new URL(deepLink, self.location.origin).href;

  /* Focaliser un onglet déjà ouvert ou en ouvrir un nouveau */
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      /* Chercher un onglet existant sur le même origin */
      const existingClient = windowClients.find((client) =>
        client.url.startsWith(self.location.origin)
      );

      if (existingClient) {
        /* Naviguer l'onglet existant vers le deepLink */
        return existingClient.focus().then((c) => c.navigate(url));
      }

      /* Ouvrir un nouvel onglet */
      return clients.openWindow(url);
    })
  );
});
