/**
 * apps/web/src/app/layout.tsx — Layout racine de l'application VIVRE
 *
 * Ce fichier est le "shell" de toutes les pages.
 * Il configure :
 * - Les polices Google Fonts (Sora, Plus Jakarta Sans, DM Sans, JetBrains Mono)
 * - Les métadonnées PWA (theme-color, manifest, apple-touch-icon)
 * - Le Provider React Query (client-side data fetching)
 * - Les métadonnées SEO de base (OpenGraph, Twitter Card)
 * - Le fond et les couleurs globales
 *
 * Next.js App Router : ce layout est un Server Component.
 * Les Providers (React Query, etc.) sont dans un client component séparé.
 */

import type { Metadata, Viewport } from "next";
import { Sora, Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";

import { Providers } from "@/components/Providers";

import "./globals.css";

/* ============================================================
 * POLICES GOOGLE FONTS
 * Next.js optimise les fonts automatiquement (self-hosted, no FOIT/FOUT)
 * ============================================================ */

/* Sora — titres, prix, slogans. Design moderne et africain */
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap", /* Swap évite les textes invisibles pendant le chargement de la police */
});

/* Plus Jakarta Sans — labels, boutons, UI */
const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

/* DM Sans — corps de texte, paragraphes, descriptions */
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

/* JetBrains Mono — codes de réservation, numéros QR */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/* ============================================================
 * MÉTADONNÉES SEO ET PWA
 * ============================================================ */

export const metadata: Metadata = {
  /* Titre de base — chaque page peut le surcharger */
  title: {
    default: "VIVRE — La billetterie des événements du Burkina Faso",
    template: "%s | VIVRE",
  },
  description:
    "Achetez vos billets d'événements au Burkina Faso — concerts, festivals, conférences. Billet numérique avec QR code, scannable à l'entrée.",

  /* Manifest PWA */
  manifest: "/manifest.json",
  applicationName: "VIVRE",

  /* Apple iOS PWA */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VIVRE",
  },

  /* OpenGraph — pour le partage sur Facebook, WhatsApp */
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: "https://vivrebf.com",
    siteName: "VIVRE",
    title: "VIVRE — La billetterie des événements du Burkina Faso",
    description: "Concerts, festivals, conférences — trouvez votre prochain événement et recevez votre billet numérique.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VIVRE — Billetterie Burkina Faso",
      },
    ],
  },

  /* Twitter Card — pour le partage sur X/Twitter */
  twitter: {
    card: "summary_large_image",
    title: "VIVRE — La billetterie des événements du Burkina Faso",
    description: "Concerts, festivals, conférences — trouvez votre prochain événement et recevez votre billet numérique.",
    images: ["/og-image.png"],
  },

  /* Robots SEO */
  robots: {
    index: true,
    follow: true,
  },
};

/* Viewport et PWA (séparé de metadata depuis Next.js 14.1) */
export const viewport: Viewport = {
  /* Couleur de la barre de statut mobile — vert forêt VIVRE (header + bottom nav) */
  themeColor: "#0F2E20",
  /* Fit pour mobiles — évite le zoom non désiré sur les inputs */
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, /* Autorise le zoom d'accessibilité */
  userScalable: true,
  /* Couleur du fond pendant le chargement (avant que CSS s'applique) */
  colorScheme: "light",
  /*
   * Sans ça, le clavier virtuel mobile ne redimensionne que le "visual viewport" — la
   * BottomNav (position:fixed) reste ancrée au layout viewport d'origine et se retrouve
   * à flotter au milieu de l'écran visible, par-dessus le contenu, tant que le clavier est
   * ouvert (ex: en tapant dans la barre de recherche de /evenements). "resizes-content"
   * force le layout viewport lui-même à rétrécir avec le clavier, comme une vraie app native.
   */
  interactiveWidget: "resizes-content",
};

/* ============================================================
 * LAYOUT RACINE
 * ============================================================ */

interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout racine — enveloppe toutes les pages de l'application.
 * Server Component : rendu côté serveur, aucun JavaScript client chargé ici.
 */
export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html
      lang="fr"
      /* Variables CSS des polices injectées sur <html> */
      className={`${sora.variable} ${jakartaSans.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      /*
       * Le script anti-flash ci-dessous ajoute la classe "dark" avant l'hydratation React —
       * le rendu serveur ne connaît jamais la préférence de thème du client, donc ce
       * mismatch est attendu à chaque chargement pour un utilisateur en mode sombre.
       * Sans ceci, React logue un avertissement d'hydratation à chaque visite.
       */
      suppressHydrationWarning
    >
      <head>
        {/*
         * Anti-flash thème — doit s'exécuter avant le premier paint, donc en tout premier
         * dans <head>, pas via next/script (qui attend l'hydratation). Lit la même clé
         * localStorage que useThemeStore (voir store/theme.store.ts) sans dépendre de
         * Zustand : ce script tourne avant que le moindre JS de l'app ne soit chargé.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=localStorage.getItem('vivre-theme');var t='light';if(r){var p=JSON.parse(r);if(p&&p.state&&p.state.theme)t=p.state.theme;}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        {/* Icône Apple Touch (PWA iOS) */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body
        className={[
          "min-h-screen bg-page",
          "font-dm antialiased",             /* DM Sans par défaut, antialiasing CSS */
          "text-ink",
          /* Padding bas = hauteur de la bottom navigation pour éviter que le contenu
             soit caché derrière la nav (seulement sur mobile) */
          "pb-safe-bottom",
        ].join(" ")}
      >
        {/*
         * Providers — Client Components qui wrappent le contenu avec des contextes React.
         * Séparé dans un fichier distinct pour que layout.tsx reste Server Component.
         * Les providers incluent : React Query, Zustand hydration, Toast provider.
         */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
