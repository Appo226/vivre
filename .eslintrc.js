/**
 * .eslintrc.js — Configuration ESLint racine du monorepo VIVRE
 *
 * Étend la config partagée @vivre/config/eslint.
 * Chaque app peut surcharger des règles spécifiques dans son propre .eslintrc.js.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["@vivre/config/eslint"],
  overrides: [
    {
      /* Apps Next.js — règles supplémentaires pour les React Server Components */
      files: ["apps/web/**/*.tsx", "apps/admin/**/*.tsx", "apps/supplier/**/*.tsx"],
      extends: ["next/core-web-vitals"],
      rules: {
        /* Next.js gère les imports d'images différemment */
        "@next/next/no-img-element": "error",
      },
    },
    {
      /* API Fastify — pas de règles React */
      files: ["apps/api/**/*.ts"],
      rules: {
        /* Les routes Fastify ont des paramètres de request/reply pas toujours utilisés */
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      },
    },
  ],
};
