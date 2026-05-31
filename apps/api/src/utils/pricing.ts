import { haversineKm } from "../services/ride-sse.service.js";

/* ============================================================
 * TARIFS DE BASE
 * ============================================================ */

/** Tarifs nationaux par défaut — utilisés si la ville n'a pas encore de taux custom */
export const DEFAULT_RATES = {
  taxi_rate_per_km:      250,
  zemidjan_rate_per_km:  150,
  min_fare:              500,
  night_rate_multiplier: 1.0,
} as const;

/** Tarifs d'une ville tels que stockés en base */
export interface CityRates {
  taxi_rate_per_km:      number;
  zemidjan_rate_per_km:  number;
  min_fare:              number;
  night_rate_multiplier: number;
}

/* ============================================================
 * MOTEUR DE RÈGLES TARIFAIRES
 * ============================================================ */

/** Règle telle que retournée par Prisma — toutes les conditions sont optionnelles */
export interface ApplicableRule {
  taxi_multiplier:     number;
  zemidjan_multiplier: number;
  months:     number[];
  weekdays:   number[];
  hour_start: number | null;
  hour_end:   number | null;
  date_from:  Date | null;
  date_to:    Date | null;
}

/** Retourne true si toutes les conditions de la règle sont satisfaites à `at`. */
function ruleMatches(rule: ApplicableRule, at: Date): boolean {
  const month   = at.getMonth() + 1; // 1-12
  const weekday = at.getDay();       // 0=dim, 6=sam
  const hour    = at.getHours();

  if (rule.months.length > 0 && !rule.months.includes(month)) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(weekday)) return false;

  if (rule.hour_start !== null && rule.hour_end !== null) {
    if (rule.hour_start <= rule.hour_end) {
      /* Plage intra-jour — ex. 7h–20h */
      if (hour < rule.hour_start || hour > rule.hour_end) return false;
    } else {
      /* Chevauchement minuit — ex. 22h–6h */
      if (hour < rule.hour_start && hour > rule.hour_end) return false;
    }
  }

  if (rule.date_from !== null && at < rule.date_from) return false;
  if (rule.date_to   !== null && at > rule.date_to)   return false;

  return true;
}

/**
 * Calcule les multiplicateurs composites à partir des règles actives.
 *
 * Toutes les règles dont les conditions sont satisfaites sont multipliées
 * entre elles (effet cumulatif). Exemple :
 *   Saison des pluies ×1.2 + Rush 17h-20h ×1.15 → ×1.38
 *
 * Plafond à 2.0× pour éviter les tarifs abusifs.
 */
export function applyRules(
  rules: ApplicableRule[],
  at: Date = new Date(),
): { taxiMult: number; zemidjanMult: number } {
  let taxiMult     = 1.0;
  let zemidjanMult = 1.0;

  for (const rule of rules) {
    if (!ruleMatches(rule, at)) continue;
    taxiMult     *= rule.taxi_multiplier;
    zemidjanMult *= rule.zemidjan_multiplier;
  }

  return {
    taxiMult:     Math.min(taxiMult, 2.0),
    zemidjanMult: Math.min(zemidjanMult, 2.0),
  };
}

/* ============================================================
 * CALCUL DU PRIX
 * ============================================================ */

/**
 * Calcule le prix estimé en FCFA pour une course.
 *
 * Formule :
 *   roadKm × baseRate × rulesMultiplier × nightMultiplier
 *   floored to min_fare
 *
 * - roadKm = haversine × 1.3 (approximation distance routière)
 * - rulesMultiplier = produit des règles actives (capped 2.0×)
 * - nightMultiplier = city.night_rate_multiplier si 22h-6h, sinon 1.0
 */
export function estimatePrice(
  pickupLat: number, pickupLng: number,
  dropoffLat: number, dropoffLng: number,
  rideType: string,
  rates: CityRates,
  rules: ApplicableRule[] = [],
  requestedAt: Date = new Date(),
): number {
  const { taxiMult, zemidjanMult } = applyRules(rules, requestedAt);

  const straightKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const roadKm     = straightKm * 1.3;

  const baseRate = rideType === "taxi"
    ? rates.taxi_rate_per_km * taxiMult
    : rideType === "zemidjan"
      ? rates.zemidjan_rate_per_km * zemidjanMult
      : 200 * Math.max(taxiMult, zemidjanMult); /* type inconnu — fallback */

  const hour      = requestedAt.getHours();
  const isNight   = hour >= 22 || hour < 6;
  const nightMult = isNight ? rates.night_rate_multiplier : 1.0;

  const price = Math.round(roadKm * baseRate * nightMult);
  return Math.max(price, rates.min_fare);
}
