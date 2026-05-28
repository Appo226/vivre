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
    default: "VIVRE — Voyager. Manger. Découvrir. au Burkina Faso",
    template: "%s | VIVRE Burkina",
  },
  description:
    "La première super-application du Burkina Faso. Transport interurbain, livraison de repas, hôtels, guides touristiques et services d'urgence. Téléchargez VIVRE dès maintenant.",

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
    url: "https://vivre.bf",
    siteName: "VIVRE",
    title: "VIVRE — Voyager. Manger. Découvrir.",
    description: "La première super-application du Burkina Faso",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VIVRE — Super-application Burkina Faso",
      },
    ],
  },

  /* Twitter Card — pour le partage sur X/Twitter */
  twitter: {
    card: "summary_large_image",
    title: "VIVRE — Voyager. Manger. Découvrir.",
    description: "La première super-application du Burkina Faso",
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
  /* Couleur de la barre de statut mobile — vert VIVRE */
  themeColor: "#1A6B3A",
  /* Fit pour mobiles — évite le zoom non désiré sur les inputs */
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, /* Autorise le zoom d'accessibilité */
  userScalable: true,
  /* Couleur du fond pendant le chargement (avant que CSS s'applique) */
  colorScheme: "light",
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
    >
      <head>
        {/* Icône Apple Touch (PWA iOS) */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body
        className={[
          "min-h-screen bg-gray-50",
          "font-dm antialiased",             /* DM Sans par défaut, antialiasing CSS */
          "text-gray-900",
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
