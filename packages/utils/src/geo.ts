/**
 * geo.ts — Utilitaires géographiques pour VIVRE
 *
 * Le Burkina Faso est un pays enclavé d'Afrique de l'Ouest.
 * Coordonnées approximatives du pays :
 * - Latitude : 9.4° à 15.1° Nord
 * - Longitude : -5.5° à 2.4° Est
 *
 * Ces fonctions côté client complètent PostGIS côté serveur.
 * PostGIS fait les calculs précis (ST_Distance, ST_Within) en SQL.
 * Ces fonctions côté client servent pour les previews et validations légères.
 *
 * Formule de Haversine : calcule la distance entre deux points GPS en tenant
 * compte de la courbure de la Terre. Précision suffisante pour des distances
 * inférieures à 100km (cas d'usage VIVRE : max ~300km Ouaga-Bobo).
 */

/** Rayon de la Terre en kilomètres (valeur moyenne WGS84) */
const EARTH_RADIUS_KM = 6371;

/**
 * Convertit des degrés en radians.
 * Requis par les fonctions trigonométriques de Math (qui opèrent en radians).
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcule la distance en km entre deux points GPS (formule de Haversine).
 * Précision ~0.5% pour des distances < 500km — suffisante pour VIVRE.
 *
 * @param lat1, lng1 - Coordonnées du point A
 * @param lat2, lng2 - Coordonnées du point B
 * @returns Distance en kilomètres (2 décimales)
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}

/**
 * Formate une distance pour l'affichage (m ou km selon la valeur).
 * @returns Ex: 850 → "850 m", 1500 → "1.5 km", 15000 → "15 km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return km < 10
    ? `${km.toFixed(1)} km`  /* "1.5 km" */
    : `${Math.round(km)} km`; /* "15 km" */
}

/**
 * Estime le temps de marche à pied en minutes.
 * Vitesse de marche supposée : 5 km/h = 83 m/min.
 * @param meters - Distance en mètres
 * @returns Temps de marche en minutes (arrondi au supérieur)
 */
export function walkingMinutes(meters: number): number {
  return Math.ceil(meters / 83);
}

/**
 * Vérifie si des coordonnées GPS sont valides et dans les limites du Burkina Faso.
 * Utilisé pour valider les données de formulaire et les signalements crowdsourcés.
 *
 * Limites approximatives du Burkina Faso (bounding box étendue pour sécurité) :
 * Lat: 9.0° à 15.5° N, Lng: -5.8° à 2.7° E
 */
export function isInBurkinaFaso(lat: number, lng: number): boolean {
  return lat >= 9.0 && lat <= 15.5 && lng >= -5.8 && lng <= 2.7;
}

/**
 * Retourne les coordonnées GPS d'une ville par son nom.
 * Utilisé comme fallback quand la géolocalisation GPS est refusée.
 * Coordonnées extraites du seed de la base de données.
 */
export const CITY_COORDINATES: Record<
  string,
  { lat: number; lng: number }
> = {
  ouagadougou: { lat: 12.3647, lng: -1.5338 },
  bobodioulasso: { lat: 11.1771, lng: -4.2979 },
  banfora: { lat: 10.6333, lng: -4.7667 },
  koudougou: { lat: 12.2500, lng: -2.3667 },
  ouahigouya: { lat: 13.5667, lng: -2.4167 },
  fada: { lat: 12.0667, lng: 0.3500 },
  dedougou: { lat: 12.4600, lng: -3.4600 },
  tenkodogo: { lat: 11.7833, lng: -0.3667 },
  kaya: { lat: 13.0833, lng: -1.0833 },
  ziniare: { lat: 12.5833, lng: -1.2833 },
} as const;

/**
 * Calcule le centre géographique d'un ensemble de points GPS.
 * Utilisé pour centrer la carte MapLibre sur les résultats de recherche.
 * @returns Coordonnées du centroïde
 */
export function calculateCenter(
  points: Array<{ latitude: number; longitude: number }>
): { lat: number; lng: number } {
  if (points.length === 0) {
    /* Fallback sur Ouagadougou si aucun point */
    return { lat: 12.3647, lng: -1.5338 };
  }

  const avgLat =
    points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const avgLng =
    points.reduce((sum, p) => sum + p.longitude, 0) / points.length;

  return { lat: avgLat, lng: avgLng };
}
