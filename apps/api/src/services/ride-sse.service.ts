/**
 * services/ride-sse.service.ts — Pub/Sub SSE pour le transport intraurbain
 *
 * Gère les connexions Server-Sent Events (SSE) entre :
 *   - Les clients (customers) qui suivent leur course en temps réel
 *   - Les chauffeurs qui reçoivent les nouvelles demandes de course
 *
 * Architecture in-memory — adapté au MVP mono-instance.
 * Pour multi-instances, remplacer par Redis pub/sub (pattern identique).
 *
 * Deux registres :
 *   customerConnections : rideId → Set<ServerResponse>
 *     (un client par course, mais Set pour gérer reconnexions rapides)
 *   driverConnections   : driverId → { res, cityId }
 *     (un seul SSE actif par chauffeur à la fois)
 */

import type { ServerResponse } from "node:http";

/* ============================================================
 * TYPES
 * ============================================================ */

interface DriverConn {
  res:    ServerResponse;
  cityId: string;
}

/* ============================================================
 * REGISTRES SSE
 * ============================================================ */

/** rideId → connexions SSE du client suivant la course */
const customerConnections = new Map<string, Set<ServerResponse>>();

/** driverId → connexion SSE du chauffeur en ligne */
const driverConnections = new Map<string, DriverConn>();

/* ============================================================
 * ABONNEMENTS CLIENT (CUSTOMER)
 * ============================================================ */

export function subscribeCustomer(rideId: string, res: ServerResponse): void {
  if (!customerConnections.has(rideId)) {
    customerConnections.set(rideId, new Set());
  }
  customerConnections.get(rideId)!.add(res);
}

export function unsubscribeCustomer(rideId: string, res: ServerResponse): void {
  const set = customerConnections.get(rideId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) customerConnections.delete(rideId);
}

/* ============================================================
 * ABONNEMENTS CHAUFFEUR (DRIVER)
 * ============================================================ */

export function subscribeDriver(driverId: string, cityId: string, res: ServerResponse): void {
  /* Fermer l'ancienne connexion si le chauffeur se reconnecte */
  const existing = driverConnections.get(driverId);
  if (existing) {
    try { existing.res.end(); } catch { /* déjà fermée */ }
  }
  driverConnections.set(driverId, { res, cityId });
}

export function unsubscribeDriver(driverId: string): void {
  driverConnections.delete(driverId);
}

export function isDriverOnline(driverId: string): boolean {
  return driverConnections.has(driverId);
}

/* ============================================================
 * PUBLICATION D'ÉVÉNEMENTS
 * ============================================================ */

/** Envoie un événement SSE au client qui suit une course précise */
export function pushToCustomer(rideId: string, event: string, data: unknown): void {
  const clients = customerConnections.get(rideId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client); /* connexion morte — nettoyage */
    }
  }
}

/**
 * Envoie un événement SSE à tous les chauffeurs disponibles d'une ville.
 * Utilisé pour diffuser une nouvelle demande de course.
 */
export function pushToDriversInCity(cityId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, conn] of driverConnections) {
    if (conn.cityId !== cityId) continue;
    try {
      conn.res.write(payload);
    } catch { /* connexion morte — sera nettoyée à la déconnexion */ }
  }
}

/** Envoie un événement SSE à un chauffeur précis */
export function pushToDriver(driverId: string, event: string, data: unknown): void {
  const conn = driverConnections.get(driverId);
  if (!conn) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  try {
    conn.res.write(payload);
  } catch {
    driverConnections.delete(driverId);
  }
}

/* ============================================================
 * UTILITAIRE — Ping keepalive
 *
 * SSE : les proxies ferment les connexions inactives après ~30s.
 * On envoie un commentaire (ligne ": ping") toutes les 20s pour
 * maintenir la connexion ouverte sans polluer le flux d'événements.
 * ============================================================ */

export function writeKeepAlive(res: ServerResponse): void {
  try { res.write(": ping\n\n"); } catch { /* connexion morte */ }
}

/* ============================================================
 * HAVERSINE — Calcul de distance entre deux points GPS
 *
 * Retourne la distance en kilomètres (ligne droite).
 * Multiplier par ~1.3 pour approximer la distance routière.
 * ============================================================ */

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; /* rayon de la Terre en km */
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
