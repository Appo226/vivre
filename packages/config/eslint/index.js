/**
 * @vivre/config/eslint — Configuration ESLint partagée pour tout le monorepo
 *
 * Pourquoi ces règles ?
 * Le projet vise la production rapide avec une équipe qui peut grandir.
 * Ces règles préviennent les bugs les plus fréquents en TypeScript + React
 * sans être trop restrictives pour ralentir le développement.
 *
 * Règles désactivées intentionnellement et pourquoi :
 * - @typescript-eslint/no-explicit-any : Zod et Prisma génèrent parfois des `any`
 *   légitimes dans les types génériques. On préfère `@ts-expect-error` ciblé.
 * - import/no-cycle : Turborepo garantit déjà l'absence de cycles inter-packages.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",

  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    /* project: true active les règles qui nécessitent l'analyse du type (plus lent mais plus précis) */
    project: true,
  },

  plugins: [
    "@typescript-eslint", /* Règles TypeScript avancées */
    "import",             /* Contrôle des imports/exports */
  ],

  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/typescript",
    "prettier", /* Doit être en dernier — désactive les règles qui conflictent avec Prettier */
  ],

  rules: {
    /* === QUALITÉ DU CODE === */

    /* Interdit les variables déclarées mais jamais utilisées (sauf si préfixées _) */
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    }],

    /* Interdit les appels de fonctions async sans await (bug silencieux fréquent) */
    "@typescript-eslint/no-floating-promises": "error",

    /* Interdit d'utiliser await sur des valeurs non-Promise */
    "@typescript-eslint/no-misused-promises": "error",

    /* Force l'utilisation explicite du type de retour des fonctions exportées */
    "@typescript-eslint/explicit-module-boundary-types": "warn",

    /* Préfère les assertions de type sûres vs les casts manuels */
    "@typescript-eslint/consistent-type-assertions": ["error", {
      assertionStyle: "as",
      objectLiteralTypeAssertions: "never",
    }],

    /* Préfère `interface` pour les types d'objets extensibles */
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

    /* Oblige l'utilisation de `import type` pour les imports de types purs */
    /* Réduit le bundle size et évite les circular deps à l'exécution */
    "@typescript-eslint/consistent-type-imports": ["error", {
      prefer: "type-imports",
    }],

    /* === IMPORTS === */

    /* Les imports doivent être ordonnés : builtins → externes → internes */
    "import/order": ["error", {
      "groups": [
        "builtin",    /* node:path, node:fs */
        "external",   /* fastify, prisma, zod */
        "internal",   /* @vivre/* */
        "parent",     /* ../.. */
        "sibling",    /* ./ */
        "index",      /* . */
      ],
      "newlines-between": "always",
      "alphabetize": { order: "asc" },
    }],

    /* Pas d'imports depuis index.ts quand l'import direct est possible */
    "import/no-duplicates": "error",

    /* === BONNES PRATIQUES === */

    /* console.log en prod = fuite d'infos sensibles */
    "no-console": ["warn", { allow: ["warn", "error"] }],

    /* Préfère === à == (évite les coercions implicites dangereuses) */
    "eqeqeq": ["error", "always"],
  },

  settings: {
    /* Permet à eslint-plugin-import de résoudre les imports TypeScript */
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: ["apps/*/tsconfig.json", "packages/*/tsconfig.json"],
      },
    },
  },

  /* Règles spécifiques aux fichiers de config et scripts */
  overrides: [
    {
      /* Les fichiers de config JS peuvent utiliser require() */
      files: ["*.js", "*.cjs"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
    {
      /* Les fichiers de test peuvent utiliser `any` et console.log */
      files: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-console": "off",
      },
    },
  ],

  /* Dossiers ignorés par ESLint */
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    "build/",
    "*.d.ts",
    "coverage/",
    "prisma/migrations/",
  ],
};
