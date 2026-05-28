/**
 * currency.ts — Formatage des montants en Francs CFA (XOF)
 *
 * Le Franc CFA BCEAO (XOF) est la monnaie du Burkina Faso et de 7 autres pays
 * d'Afrique de l'Ouest. Il est ancré à l'euro (1 EUR = 655.957 XOF fixe).
 *
 * Particularités du formatage FCFA :
 * - Pas de décimales (le CFA est entier — pas de centimes)
 * - Séparateur de milliers = espace (standard francophone)
 * - Symbole "FCFA" placé après le montant (convention locale)
 * - Ex: 25 000 FCFA, 1 500 FCFA, 500 FCFA
 *
 * Pourquoi ne pas utiliser Intl.NumberFormat directement ?
 * L'API Intl.NumberFormat avec locale "fr-BF" n'est pas toujours disponible
 * sur les anciens navigateurs Android (fréquents au Burkina). Cette implémentation
 * garantit un formatage cohérent sur tous les appareils.
 */

/**
 * Formate un montant en FCFA avec séparateurs de milliers.
 * @param amount - Montant en FCFA (entier)
 * @param options.showSymbol - Afficher le symbole "FCFA" (défaut: true)
 * @returns Chaîne formatée ex: "25 000 FCFA"
 */
export function formatFCFA(
  amount: number,
  options: { showSymbol?: boolean } = {}
): string {
  const { showSymbol = true } = options;

  /* Arrondir à l'entier le plus proche — le FCFA n'a pas de sous-unité */
  const rounded = Math.round(amount);

  /* Séparer les milliers avec des espaces (convention francophone africaine) */
  const formatted = rounded.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return showSymbol ? `${formatted} FCFA` : formatted;
}

/**
 * Formate un prix par nuit pour l'hébergement.
 * @returns Ex: "25 000 FCFA / nuit"
 */
export function formatPricePerNight(pricePerNight: number): string {
  return `${formatFCFA(pricePerNight)} / nuit`;
}

/**
 * Calcule le montant de la commission VIVRE (12% par défaut).
 * La commission est prélevée sur chaque transaction et reversée à VIVRE.
 * @param amount - Montant total en FCFA
 * @param commissionPercent - Taux de commission (défaut: 12%)
 * @returns { platformFee, supplierAmount } — les deux parties de la transaction
 */
export function calculateCommission(
  amount: number,
  commissionPercent = 12
): { platformFee: number; supplierAmount: number } {
  /* Arrondir au FCFA entier — pas de demi-francs */
  const platformFee = Math.round(amount * (commissionPercent / 100));
  const supplierAmount = amount - platformFee;

  return { platformFee, supplierAmount };
}

/**
 * Parse un string de montant FCFA vers un entier.
 * Utile pour les champs de formulaire où l'utilisateur saisit "25 000".
 * Supprime les espaces, virgules et "FCFA" avant conversion.
 * @returns null si le parsing échoue (valeur invalide)
 */
export function parseFCFA(value: string): number | null {
  /* Supprimer tout sauf les chiffres */
  const cleaned = value.replace(/[^\d]/g, "");

  if (!cleaned) return null;

  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Vérifie si un montant est dans une plage valide pour VIVRE.
 * Minimum: 100 FCFA (évite les micro-transactions problématiques côté opérateur)
 * Maximum: 10 000 000 FCFA (10M FCFA ≈ 15 000 EUR — plafond raisonnable)
 */
export function isValidFCFAAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 100 && amount <= 10_000_000;
}
