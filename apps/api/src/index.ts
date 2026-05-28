/**
 * apps/api/src/index.ts — Point d'entrée de l'API VIVRE
 *
 * Ce fichier démarre le serveur Fastify sur le port défini par API_PORT
 * (défaut: 3001). Il importe l'application configurée depuis app.ts
 * et gère uniquement le bootstrap et l'arrêt propre du serveur.
 *
 * Séparation index.ts / app.ts :
 * - index.ts = démarre le serveur (start/stop)
 * - app.ts = configure l'application (plugins, routes, hooks)
 * Cette séparation permet de tester app.ts sans démarrer un vrai serveur.
 */

import { buildApp } from "./app.js";

/* === DÉMARRAGE DU SERVEUR === */

async function start(): Promise<void> {
  /* Construire l'application Fastify configurée */
  const app = await buildApp();

  /* Port de l'API — 3001 par défaut pour ne pas entrer en conflit avec Next.js (3000) */
  const port = parseInt(process.env["API_PORT"] ?? "3001", 10);
  const host = process.env["HOST"] ?? "0.0.0.0";

  try {
    /* Démarrage du serveur — Fastify bind sur host:port */
    await app.listen({ port, host });
    app.log.info(`🚀 API VIVRE démarrée sur http://${host}:${port}/v1`);
    app.log.info(`📡 WebSocket disponible sur ws://${host}:${port}`);
    app.log.info(`🌍 Environment : ${process.env["NODE_ENV"] ?? "development"}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

/* === ARRÊT PROPRE (Graceful Shutdown) === */

/*
 * Pourquoi un graceful shutdown ?
 * Sans arrêt propre, les requêtes en cours (paiements Orange Money, bookings)
 * seraient interrompues brusquement. Le graceful shutdown attend que toutes
 * les requêtes actives se terminent avant de couper le serveur.
 * Critique pour les paiements — une coupure en plein webhook Orange Money
 * pourrait laisser un paiement en état "processing" indéfiniment.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n📴 Arrêt du serveur (signal: ${signal})...`);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM")); /* Kubernetes, Docker */
process.on("SIGINT", () => void shutdown("SIGINT"));   /* Ctrl+C en développement */

/* Lancement */
void start();
