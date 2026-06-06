/**
 * phone.ts — Normalisation et validation des numéros de téléphone burkinabè
 *
 * Le Burkina Faso (indicatif +226) utilise des numéros à 8 chiffres.
 * Opérateurs mobiles :
 * - Orange Burkina : 04, 05, 06, 07, 54, 55, 56, 57, 64, 65, 66, 67, 74, 75, 76, 77
 * - Moov Africa : 60, 61, 62, 63, 70, 71, 72, 73
 * - Télécel (résiduel) : autres préfixes
 *
 * L'authentification VIVRE se fait par numéro de téléphone + OTP.
 * La normalisation garantit qu'un numéro est toujours stocké au format +226XXXXXXXX.
 * Sans normalisation, "0660000001" et "+22660000001" et "60000001" seraient traités
 * comme 3 comptes différents — un bug critique pour l'authentification.
 */

/** Indicatif pays du Burkina Faso */
const BURKINA_COUNTRY_CODE = "+226";

/** Longueur d'un numéro burkinabè sans indicatif (8 chiffres) */
const LOCAL_NUMBER_LENGTH = 8;

/**
 * Normalises a phone number to E.164 format.
 *
 * International numbers (already E.164) are returned as-is.
 * Burkina Faso local shortcuts are expanded to +226XXXXXXXX.
 *
 * Examples:
 *   "+15747100846"  → "+15747100846"  (US, unchanged)
 *   "+22670123456"  → "+22670123456"  (BF E.164, unchanged)
 *   "70123456"      → "+22670123456"  (BF local 8-digit)
 *   "070123456"     → "+22670123456"  (BF local with leading 0)
 *   "0022670123456" → "+22670123456"  (BF with 00 prefix)
 *
 * @returns null if the number cannot be normalised
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");

  /* Already valid E.164 (+[1-9] followed by 6-14 more digits) */
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  /* 00226XXXXXXXX → +226XXXXXXXX */
  if (cleaned.startsWith("00226") && cleaned.length === 5 + LOCAL_NUMBER_LENGTH) {
    return `+226${cleaned.slice(5)}`;
  }

  /* 226XXXXXXXX (no +) → +226XXXXXXXX */
  if (cleaned.startsWith("226") && cleaned.length === 3 + LOCAL_NUMBER_LENGTH) {
    return `+${cleaned}`;
  }

  /* 0XXXXXXXX (9 digits, BF local with leading 0) → +226XXXXXXXX */
  if (cleaned.startsWith("0") && cleaned.length === LOCAL_NUMBER_LENGTH + 1) {
    return `${BURKINA_COUNTRY_CODE}${cleaned.slice(1)}`;
  }

  /* XXXXXXXX (8 bare digits, BF local) → +226XXXXXXXX */
  if (/^\d{8}$/.test(cleaned)) {
    return `${BURKINA_COUNTRY_CODE}${cleaned}`;
  }

  return null;
}

/**
 * Vérifie si un numéro normalisé est un numéro mobile Orange Burkina.
 * Utile pour l'affichage du logo Orange sur l'option de paiement.
 *
 * Préfixes Orange Burkina : 04, 05, 06, 07, 54, 55, 56, 57, 64, 65, 66, 67, 74, 75, 76, 77
 */
export function isOrangeBurkinaNumber(normalizedPhone: string): boolean {
  /* Extraire les 2 premiers chiffres du numéro local (après +226) */
  const localPrefix = normalizedPhone.slice(4, 6);
  const orangePrefixes = ["04", "05", "06", "07", "54", "55", "56", "57",
                          "64", "65", "66", "67", "74", "75", "76", "77"];
  return orangePrefixes.includes(localPrefix);
}

/**
 * Vérifie si un numéro normalisé est un numéro Moov Africa Burkina.
 * Préfixes Moov : 60, 61, 62, 63, 70, 71, 72, 73
 */
export function isMoovBurkinaNumber(normalizedPhone: string): boolean {
  const localPrefix = normalizedPhone.slice(4, 6);
  const moovPrefixes = ["60", "61", "62", "63", "70", "71", "72", "73"];
  return moovPrefixes.includes(localPrefix);
}

/**
 * Formate un numéro normalisé pour l'affichage à l'utilisateur.
 * Format lisible burkinabè : +226 XX XX XX XX
 * @returns Ex: "+226 60 00 00 01"
 */
export function displayPhone(normalizedPhone: string): string {
  if (!normalizedPhone.startsWith("+226")) return normalizedPhone;

  /* Extraire les 8 chiffres locaux et les grouper par 2 */
  const local = normalizedPhone.slice(4);
  const groups = local.match(/.{1,2}/g) ?? [];
  return `+226 ${groups.join(" ")}`;
}

/**
 * Masque un numéro de téléphone pour l'affichage partiel (confidentialité).
 * @returns Ex: "+226 60 *** ** 01"
 */
export function maskPhone(normalizedPhone: string): string {
  if (!normalizedPhone.startsWith("+226")) return normalizedPhone;

  const local = normalizedPhone.slice(4);
  /* Garder les 2 premiers et 2 derniers chiffres, masquer le reste */
  return `+226 ${local.slice(0, 2)} *** ** ${local.slice(6)}`;
}
