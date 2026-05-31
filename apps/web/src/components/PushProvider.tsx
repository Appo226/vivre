"use client";

/**
 * components/PushProvider.tsx — Initialisation silencieuse des notifications push
 *
 * Composant client wrappé dans le layout app/(app)/layout.tsx.
 * Il active le hook usePushNotifications() qui :
 *   1. Demande la permission push à l'utilisateur (une seule fois)
 *   2. Enregistre le token FCM auprès de notre API
 *   3. Écoute les notifications FCM en foreground
 *
 * Rendu comme fragment vide — aucun impact visuel.
 * Séparé du layout (server component) car les hooks ne peuvent pas
 * s'exécuter dans un server component.
 */

import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushProvider() {
  usePushNotifications();
  return null; /* Pas d'UI — effet de bord uniquement */
}
