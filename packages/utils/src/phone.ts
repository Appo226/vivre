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
 * Normalise un numéro de téléphone burkinabè au format E.164 (+226XXXXXXXX).
 * Gère les formats courants saisis par les utilisateurs.
 *
 * Exemples de normalisation :
 * "0660000001" → "+22660000001" (supprime le 0 initial puis ajoute +226)
 * "+22660000001" → "+22660000001" (déjà normalisé)
 * "60000001" → "+22660000001" (8 chiffres directs)
 * "226 60 00 00 01" → "+22660000001" (espaces supprimés)
 *
 * @returns null si le numéro ne peut pas être normalisé
 */
export function normalizePhone(raw: string): string | null {
  /* Supprimer tous les espaces, tirets, parenthèses */
  const cleaned = raw.replace(/[\s\-().]/g, "");

  /* Déjà au format international +226XXXXXXXX */
  if (cleaned.startsWith("+226") && cleaned.length === 4 + LOCAL_NUMBER_LENGTH) {
    return cleaned;
  }

  /* Format 00226XXXXXXXX */
  if (cleaned.startsWith("00226") && cleaned.length === 5 + LOCAL_NUMBER_LENGTH) {
    return `+226${cleaned.slice(5)}`;
  }

  /* Format 226XXXXXXXX (sans le +) */
  if (cleaned.startsWith("226") && cleaned.length === 3 + LOCAL_NUMBER_LENGTH) {
    return `+${cleaned}`;
  }

  /* Format local 0XXXXXXXX (0 + 8 chiffres = 9 chiffres) */
  if (cleaned.startsWith("0") && cleaned.length === LOCAL_NUMBER_LENGTH + 1) {
    return `${BURKINA_COUNTRY_CODE}${cleaned.slice(1)}`;
  }

  /* Format local XXXXXXXX (8 chiffres directs) */
  if (/^\d{8}$/.test(cleaned)) {
    return `${BURKINA_COUNTRY_CODE}${cleaned}`;
  }

  /* Numéro non reconnu */
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
