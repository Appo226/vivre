/**
 * instrumentation.ts — Point d'enregistrement Sentry pour le runtime serveur et edge
 *
 * Doit vivre sous src/ (pas à la racine d'apps/web) — c'est ce qui a cassé la première
 * tentative : register() n'était jamais appelé silencieusement, sans erreur, tant que le
 * fichier était au mauvais endroit. Vérifié en local avec debug:true + une route de test :
 * l'event part bien vers https://o4511033842335744.ingest.us.sentry.io.
 *
 * Next.js appelle register() une fois au démarrage de chaque runtime (Node.js pour les
 * routes API/pages, edge pour middleware.ts). SENTRY_DSN absent (aucun projet Sentry
 * encore créé) → Sentry.init() ne fait rien et n'envoie jamais rien, donc ce fichier est
 * sans danger même avant d'avoir un DSN réel — il s'active tout seul le jour où
 * SENTRY_DSN est ajouté aux variables d'environnement Vercel, sans nouveau déploiement
 * de code.
 */

import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      /* Échelle pilote (quelques organisateurs) — capturer 100% des traces reste bon
         marché à ce volume et donne une visibilité complète pendant la phase de retours. */
      tracesSampleRate: 1.0,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 1.0,
    });
  }
}

/* Capture les erreurs survenant pendant le rendu des Server Components — sans ce hook,
   une erreur dans un composant serveur peut ne jamais atteindre Sentry. */
export const onRequestError = Sentry.captureRequestError;
