/**
 * lib/utils.ts — Utilitaires de classe CSS pour le design system VIVRE
 *
 * cn() = combinaison de clsx (conditions) + tailwind-merge (déduplication).
 * Sans tailwind-merge, "p-4 p-8" appliquerait les deux paddings de façon imprévisible.
 * Avec tailwind-merge, la dernière classe gagne : "p-4 p-8" → "p-8".
 *
 * Usage dans les composants :
 *   cn("base-class", isActive && "active-class", className)
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Fusionne les classes Tailwind en évitant les conflits.
 * Accepte n'importe quelle combinaison de strings, arrays, objets conditionnels.
 * @example cn("p-4 text-sm", isLarge && "p-8 text-lg", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
