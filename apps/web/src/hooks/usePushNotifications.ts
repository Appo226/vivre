/**
 * hooks/usePushNotifications.ts — Enregistrement des notifications push FCM
 *
 * Ce hook s'occupe de tout le cycle de vie des notifications push :
 *   1. Demander la permission à l'utilisateur (une seule fois)
 *   2. Obtenir le token FCM de l'appareil
 *   3. Envoyer le token à notre API (POST /notifications/device-token)
 *   4. Écouter les notifications FCM reçues en foreground (app ouverte)
 *      et les afficher via un toast/badge
 *
 * Appelé depuis le layout principal après la connexion.
 * Ne fait rien si l'utilisateur n'est pas connecté.
 *
 * POURQUOI UN HOOK SÉPARÉ :
 *   L'enregistrement push est un effet de bord qui ne doit tourner qu'une
 *   fois par session, après que l'auth est confirmée. Le séparer du store
 *   Zustand évite les dépendances circulaires et facilite les tests.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth.store";
import { getFcmToken, onForegroundMessage } from "@/lib/firebase";
import { apiClient } from "@/lib/api";

export function usePushNotifications() {
  const { accessToken } = useAuthStore();
  /* Ref pour éviter de ré-enregistrer le token à chaque re-render */
  const registered = useRef(false);

  useEffect(() => {
    /* Ne rien faire si non connecté ou déjà enregistré */
    if (!accessToken || registered.current) return;

    /* FCM nécessite le navigateur — guard SSR */
    if (typeof window === "undefined") return;

    /* Les notifications push ne sont disponibles que dans un contexte sécurisé (HTTPS ou localhost) */
    if (!("Notification" in window)) return;

    registered.current = true;

    async function registerPush() {
      try {
        const token = await getFcmToken();
        if (!token) return; /* Permission refusée ou FCM non configuré */

        /* Persister pour le nettoyage à la déconnexion */
        localStorage.setItem("vivre_fcm_token", token);

        /* Envoyer le token à l'API pour le stocker dans device_tokens */
        await apiClient.post("/notifications/device-token", { token, platform: "web" });
      } catch {
        /* Silencieux — les push ne sont pas critiques */
      }
    }

    void registerPush();
  }, [accessToken]);

  useEffect(() => {
    /* Écouter les notifications FCM en foreground (app ouverte) */
    if (!accessToken) return;

    let unsubscribe: (() => void) | null = null;

    async function listenForeground() {
      unsubscribe = await onForegroundMessage((payload) => {
        const title = payload.notification?.title ?? "VIVRE";
        const body  = payload.notification?.body  ?? "";

        /*
         * Afficher via l'API Notification du navigateur.
         * En production, on utilisera un toast UI (Sonner, react-hot-toast).
         * Pour l'instant, la notification native suffit.
         */
        if (Notification.permission === "granted") {
          new Notification(title, {
            body,
            icon: "/icons/icon-192x192.png",
          });
        }
      });
    }

    void listenForeground();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [accessToken]);
}
