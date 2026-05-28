/**
 * tailwind.config.ts — Configuration Tailwind CSS pour apps/web
 *
 * Étend la config partagée @vivre/config/tailwind avec les chemins de contenu
 * spécifiques à l'app web. Les composants @vivre/ui sont aussi inclus pour
 * que leurs classes Tailwind soient générées dans le bundle final.
 *
 * Ne pas dupliquer les couleurs et thèmes ici — ils viennent tous de @vivre/config.
 */

import type { Config } from "tailwindcss";
import { vivreTailwindConfig } from "@vivre/config/tailwind";

const config: Config = {
  /* Étendre la config partagée */
  ...vivreTailwindConfig,

  /*
   * content — Chemins où Tailwind cherche les classes utilisées.
   * Inclut les composants de @vivre/ui pour ne pas supprimer leurs classes.
   * Tailwind supprime (tree-shakes) les classes non référencées dans ces fichiers.
   */
  content: [
    "./src/**/*.{ts,tsx}",          /* Toutes les pages et composants de apps/web */
    "../../packages/ui/src/**/*.{ts,tsx}", /* Composants @vivre/ui */
  ],

  plugins: [
    require("@tailwindcss/typography"), /* Pour les descriptions riches (attractions, hôtels) */
    require("@tailwindcss/forms"),      /* Reset des styles de formulaires */
  ],
};

export default config;
