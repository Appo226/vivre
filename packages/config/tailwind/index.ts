/**
 * @vivre/config/tailwind — Configuration Tailwind CSS partagée
 *
 * Contient le design system complet de VIVRE :
 * - Couleurs de marque (Vert #1A6B3A, Rouge #EF2B2D, Or #F5A623, Sombre #1A1A2E)
 * - Typographie (Sora pour les titres, DM Sans pour le corps)
 * - Animations personnalisées (skeleton loading pour les états de chargement réseau instable)
 * - Breakpoints adaptés au mobile-first (90%+ des utilisateurs burkinabè sur mobile)
 *
 * Pourquoi centraliser Tailwind ?
 * Sans ce fichier partagé, web/admin/supplier auraient chacun leur propre config.
 * Un changement de couleur de marque demanderait 3 modifications. Ici : une seule.
 *
 * Usage dans apps/web/tailwind.config.ts :
 *   import { vivreTailwindConfig } from '@vivre/config/tailwind'
 *   export default { ...vivreTailwindConfig, content: ['./src/**\/*.tsx'] }
 */

import type { Config } from "tailwindcss";

/**
 * Design tokens VIVRE — Ne jamais modifier ces valeurs sans accord de l'équipe design.
 * Ces couleurs correspondent à l'identité visuelle officielle validée.
 */
export const vivreColors = {
  /* Vert VIVRE — couleur principale. Représente l'espoir, la nature, le Burkina */
  green: {
    DEFAULT: "#1A6B3A",
    50: "#E8F5ED",
    100: "#C5E8D1",
    200: "#9ED5B0",
    300: "#77C28F",
    400: "#50AF6E",
    500: "#1A6B3A", /* Principal */
    600: "#155730",
    700: "#104326",
    800: "#0B2F1C",
    900: "#061B10",
  },

  /* Rouge VIVRE — urgences, alertes, boutons d'action critique */
  red: {
    DEFAULT: "#EF2B2D",
    50: "#FDE8E8",
    100: "#FBC5C6",
    200: "#F79FA0",
    300: "#F3797A",
    400: "#EF5254",
    500: "#EF2B2D", /* Principal */
    600: "#BF2224",
    700: "#8F1A1B",
    800: "#601112",
    900: "#300909",
  },

  /* Or VIVRE — accent, prix, badges premium */
  gold: {
    DEFAULT: "#F5A623",
    50: "#FEF3E0",
    100: "#FDE4B4",
    200: "#FCD388",
    300: "#FAC25C",
    400: "#F9B13F",
    500: "#F5A623", /* Principal */
    600: "#C4851C",
    700: "#936415",
    800: "#62420E",
    900: "#312107",
  },

  /* Sombre VIVRE — fond principal de l'interface (mode clair : blanc ; mode sombre : dark) */
  dark: {
    DEFAULT: "#1A1A2E",
    50: "#E8E8EF",
    100: "#C5C5D7",
    200: "#9E9EBC",
    300: "#7777A0",
    400: "#505085",
    500: "#1A1A2E", /* Principal */
    600: "#151525",
    700: "#10101C",
    800: "#0B0B13",
    900: "#05050A",
  },
} as const;

/**
 * Configuration Tailwind complète pour le design system VIVRE.
 * Chaque app importe et étend cette config en ajoutant son propre `content`.
 */
export const vivreTailwindConfig: Omit<Config, "content"> = {
  /*
   * darkMode: 'class' — Le mode sombre est activé via la classe "dark" sur <html>.
   * Cela permet à l'utilisateur de choisir son thème indépendamment du système.
   */
  darkMode: "class",

  theme: {
    extend: {
      colors: {
        /* Couleurs de marque VIVRE */
        ...vivreColors,

        /* Alias sémantiques — utiliser ces noms dans les composants, pas les valeurs hex */
        primary: vivreColors.green.DEFAULT,
        "primary-dark": vivreColors.green[700],
        "primary-light": vivreColors.green[100],

        danger: vivreColors.red.DEFAULT,
        "danger-light": vivreColors.red[50],

        accent: vivreColors.gold.DEFAULT,
        "accent-light": vivreColors.gold[50],

        surface: vivreColors.dark.DEFAULT,
      },

      fontFamily: {
        /* Sora — titres, slogans, prix. Caractère moderne et africain */
        sora: ["Sora", "sans-serif"],
        /* Plus Jakarta Sans — boutons, labels, UI */
        jakarta: ["Plus Jakarta Sans", "sans-serif"],
        /* DM Sans — corps de texte, descriptions, paragraphes */
        dm: ["DM Sans", "sans-serif"],
        /* JetBrains Mono — codes QR textuels, numéros de réservation */
        mono: ["JetBrains Mono", "monospace"],
      },

      /*
       * Animations personnalisées pour les états de chargement.
       * Au Burkina Faso, la connexion peut être lente (2G/3G).
       * Le skeleton loading réduit l'anxiété de l'utilisateur pendant le chargement.
       */
      animation: {
        "skeleton-pulse": "skeleton-pulse 1.5s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        /* Animation de l'indicateur de livraison en cours */
        "bounce-dot": "bounce-dot 1.2s ease-in-out infinite",
      },

      keyframes: {
        "skeleton-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          from: { transform: "translateY(-100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
      },

      /*
       * Espacement personnalisé pour la bottom navigation mobile.
       * La barre de navigation du bas fait 72px → le contenu doit avoir
       * un padding-bottom = 72px + safe-area-inset pour les notches iPhone.
       */
      spacing: {
        "bottom-nav": "72px",
        "safe-bottom": "calc(72px + env(safe-area-inset-bottom))",
      },

      /*
       * Breakpoints — Mobile-first pour VIVRE.
       * L'écrasante majorité des utilisateurs burkinabè accède via smartphone.
       * On ne doit jamais concevoir desktop-first.
       */
      screens: {
        xs: "375px",  /* Petits smartphones (iPhone SE, anciens Android) */
        sm: "640px",  /* Smartphones modernes */
        md: "768px",  /* Tablettes */
        lg: "1024px", /* Desktop — pour admin et supplier dashboard */
        xl: "1280px",
        "2xl": "1536px",
      },

      borderRadius: {
        /* Rayon de 16px sur les cards — cohérent avec Material Design 3 */
        card: "16px",
        /* Rayon de 24px sur les modales */
        modal: "24px",
        /* Rayon pour les badges */
        badge: "8px",
      },

      boxShadow: {
        /* Ombre subtile pour les cards (évite l'effet trop élevé en lumière directe) */
        card: "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
        /* Ombre plus prononcée pour les modales et drawers */
        modal: "0 20px 60px rgba(0, 0, 0, 0.15)",
        /* Ombre de la bottom navigation */
        "bottom-nav": "0 -2px 10px rgba(0, 0, 0, 0.08)",
      },
    },
  },

  plugins: [
    /*
     * @tailwindcss/typography — Styles pour les descriptions longues (attractions, hôtels)
     * Active via la classe `prose` sur les blocs de texte riche
     */
    // require('@tailwindcss/typography'),

    /*
     * @tailwindcss/forms — Reset des styles de formulaires pour la cohérence cross-browser
     * Essentiel pour les inputs OTP, les champs de recherche, les sélecteurs de date
     */
    // require('@tailwindcss/forms'),
  ],
};

export default vivreTailwindConfig;
