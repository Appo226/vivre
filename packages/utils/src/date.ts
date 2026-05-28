/**
 * date.ts — Utilitaires de gestion des dates pour VIVRE
 *
 * Timezone du Burkina Faso : "Africa/Ouagadougou" = UTC+0 toute l'année.
 * Le Burkina n'applique pas le changement d'heure saisonnier (DST).
 * Cela simplifie la gestion des dates — UTC = heure locale.
 *
 * Cependant, les développeurs et serveurs peuvent être dans d'autres timezones,
 * donc on normalise toujours en spécifiant explicitement la timezone.
 *
 * dayjs est utilisé plutôt que date-fns pour sa légèreté (2KB vs 20KB).
 * Pour le Burkina Faso, les features avancées de date-fns ne sont pas nécessaires.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import "dayjs/locale/fr.js"; /* Locale française pour les messages relatifs */

/* Activation des plugins dayjs — doit être fait avant tout usage */
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale("fr"); /* "il y a 5 minutes", "dans 2 heures" en français */

/** Timezone du Burkina Faso — UTC+0, pas de DST */
export const BURKINA_TIMEZONE = "Africa/Ouagadougou" as const;

/**
 * Retourne l'heure actuelle en heure de Ouagadougou.
 * Équivalent à new Date() mais explicitement contextualisé.
 */
export function nowInOuaga(): dayjs.Dayjs {
  return dayjs().tz(BURKINA_TIMEZONE);
}

/**
 * Formate une date ISO 8601 pour l'affichage en français.
 * @param isoDate - Date ISO (ex: "2026-03-15T14:30:00Z")
 * @param format - Format dayjs (défaut: "D MMM YYYY à HH:mm")
 * @returns Ex: "15 mars 2026 à 14h30"
 */
export function formatDate(isoDate: string, format = "D MMM YYYY à HH:mm"): string {
  return dayjs(isoDate).tz(BURKINA_TIMEZONE).format(format);
}

/**
 * Formate une date courte pour les listes (sans l'heure).
 * @returns Ex: "15 mars 2026"
 */
export function formatDateShort(isoDate: string): string {
  return dayjs(isoDate).tz(BURKINA_TIMEZONE).format("D MMM YYYY");
}

/**
 * Formate une heure depuis un ISO 8601.
 * @returns Ex: "14h30"
 */
export function formatTime(isoDate: string): string {
  return dayjs(isoDate).tz(BURKINA_TIMEZONE).format("HH[h]mm");
}

/**
 * Calcule le nombre de nuits entre deux dates YYYY-MM-DD.
 * Utilisé pour le calcul du prix total d'une réservation hôtelière.
 * @returns Nombre de nuits (entier positif)
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const from = dayjs(checkIn);
  const to = dayjs(checkOut);

  /* dayjs().diff() retourne la différence en unités — "day" = jours entiers */
  return to.diff(from, "day");
}

/**
 * Retourne une date relative en français.
 * Utilise le plugin relativeTime de dayjs + locale française.
 * @returns Ex: "il y a 5 minutes", "dans 2 heures"
 */
export function relativeFromNow(isoDate: string): string {
  return dayjs(isoDate).fromNow();
}

/**
 * Vérifie si une date YYYY-MM-DD est dans le futur (ou aujourd'hui).
 * Utilisé pour valider les dates de check-in/check-out et de réservation.
 */
export function isFutureOrToday(dateStr: string): boolean {
  const date = dayjs(dateStr);
  const today = nowInOuaga().startOf("day");
  return date.isSame(today) || date.isAfter(today);
}

/**
 * Convertit un HH:MM string en minutes depuis minuit.
 * Utile pour comparer les horaires d'ouverture.
 * @returns Ex: "14:30" → 870 (14*60 + 30)
 */
export function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Vérifie si un service est actuellement ouvert selon ses horaires.
 * @param openingHours - Ex: { "mon": "08:00-17:00", "sun": "closed" }
 * @returns true si le service est ouvert maintenant
 */
export function isCurrentlyOpen(openingHours: Record<string, string>): boolean {
  const now = nowInOuaga();

  /* Noms des jours en format dayjs (1=lundi...7=dimanche) → clés de notre format */
  const dayKeys = ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const dayKey = dayKeys[now.day() === 0 ? 7 : now.day()];

  if (!dayKey) return false;

  /* Chercher d'abord le jour spécifique, puis "every_day" comme fallback */
  const schedule = openingHours[dayKey] ?? openingHours["every_day"];

  if (!schedule || schedule === "closed") return false;

  /* Parser la plage horaire "HH:MM-HH:MM" */
  const [openTime, closeTime] = schedule.split("-");
  if (!openTime || !closeTime) return false;

  const currentMinutes = now.hour() * 60 + now.minute();
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/**
 * Formate une durée en minutes en texte lisible.
 * @returns Ex: 90 → "1h30", 45 → "45 min", 120 → "2h"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h${remainingMinutes}` : `${hours}h`;
}
