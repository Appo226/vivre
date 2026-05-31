/**
 * next.config.js — Configuration Next.js pour apps/web (VIVRE PWA)
 *
 * Utilise .js (CommonJS) car next-pwa v5 est un module CommonJS.
 * Next.js 14 ne supporte pas next.config.ts — voir next.config.mjs pour Next.js 15+.
 *
 * Pourquoi le mode PWA est critique pour VIVRE ?
 * Au Burkina Faso, les utilisateurs peuvent perdre la connexion en déplacement.
 * Le mode offline permet de voir les urgences (SP-001), lignes SOTRACO (TU-004),
 * et attractions (AT-001) sans internet. Données critiques pré-cachées.
 */

const fs   = require("fs");
const path = require("path");

/**
 * Plugin webpack qui génère public/firebase-config.js au moment du build.
 * Les NEXT_PUBLIC_* sont disponibles dans process.env pendant le build Next.js,
 * mais pas dans le Service Worker (pas de bundling SW côté client).
 * Ce fichier est ensuite importé par firebase-messaging-sw.js via importScripts.
 */
class FirebaseSwConfigPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap("FirebaseSwConfigPlugin", () => {
      const config = {
        apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "",
        authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "",
        projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "",
        storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "",
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "",
      };
      const outPath = path.join(__dirname, "public", "firebase-config.js");
      fs.writeFileSync(outPath, `self.FIREBASE_CONFIG = ${JSON.stringify(config)};`);
    });
  }
}

// next-pwa v5 est CommonJS — require() requis
const withPWA = require("next-pwa")({
  dest: "public",              /* Service Worker généré dans public/ */
  register: true,              /* Enregistrement automatique du SW */
  skipWaiting: true,           /* Mise à jour immédiate du SW */
  /* Désactivé en dev — le SW interfère avec le hot-reload Next.js */
  disable: process.env.NODE_ENV === "development",

  /* Page affichée quand le réseau est indisponible et la page n'est pas en cache */
  fallbacks: {
    document: "/offline",
  },

  /* Stratégies de cache par type de ressource */
  runtimeCaching: [
    {
      /* Services publics, urgences — cache long (données stables) */
      urlPattern: /\/v1\/public-services|\/v1\/emergency-numbers|\/v1\/cities/,
      handler: "CacheFirst",
      options: {
        cacheName: "vivre-static-data",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 7, /* 7 jours */
        },
      },
    },
    {
      /* Lignes SOTRACO — cache 24h (données quasi-statiques) */
      urlPattern: /\/v1\/urban-lines/,
      handler: "CacheFirst",
      options: {
        cacheName: "vivre-sotraco",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24, /* 24 heures */
        },
      },
    },
    {
      /* Images S3 — cache permanent (les images ne changent pas d'URL) */
      urlPattern: /\.amazonaws\.com\/.*\.(png|jpg|jpeg|svg|webp)/,
      handler: "CacheFirst",
      options: {
        cacheName: "vivre-images",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, /* 30 jours */
        },
      },
    },
    {
      /* API dynamique — Network First (données fraîches, fallback cache) */
      urlPattern: /\/v1\//,
      handler: "NetworkFirst",
      options: {
        cacheName: "vivre-api",
        /* Fallback cache si >10s — réseau lent Burkina Faso */
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 5, /* 5 minutes */
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* === IMAGES === */
  images: {
    remotePatterns: [
      {
        /*
         * Firebase Storage (Google Cloud Storage CDN).
         * Remplace AWS S3 — même latence CDN, SDK plus simple, crédits startup Google.
         * URL format : https://storage.googleapis.com/{projectId}.appspot.com/{path}
         */
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        /*
         * Firebase Storage via firebasestorage.googleapis.com
         * (URL alternative retournée par le SDK Firebase)
         */
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        /* Développement local — émulateur Firebase Storage */
        protocol: "http",
        hostname: "localhost",
        port: "9199",
      },
    ],
    /* WebP et AVIF — meilleure compression pour mobiles avec connexion lente */
    formats: ["image/avif", "image/webp"],
  },

  /* === HEADERS DE SÉCURITÉ === */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          /* Prévient le MIME-sniffing */
          { key: "X-Content-Type-Options", value: "nosniff" },
          /* Prévient l'embedding dans des iframes (clickjacking) */
          { key: "X-Frame-Options", value: "DENY" },
          /* Force HTTPS en production */
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          /* Référenceur — seulement origin (pas de path complet) */
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  /* === REDIRECTION API === */
  /*
   * Optionnel : rediriger /api/* vers l'API Fastify sur :3001.
   * En production, c'est le reverse proxy Nginx qui gère cette redirection.
   */
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/:path*",
            destination: "http://localhost:3001/:path*",
          },
        ]
      : [];
  },

  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

  webpack(config, { isServer }) {
    /* Injecter la config Firebase dans le SW uniquement côté client */
    if (!isServer) {
      config.plugins.push(new FirebaseSwConfigPlugin());
    }
    return config;
  },

  /*
   * Injecter la configuration Firebase dans le Service Worker firebase-messaging-sw.js.
   * Les NEXT_PUBLIC_* variables ne sont pas accessibles dans les SW (pas de bundling).
   * On injecte via un script inline qui définit window.__FIREBASE_CONFIG__ avant
   * que le SW ne soit enregistré.
   *
   * Alternative : inclure les valeurs directement dans firebase-messaging-sw.js
   * (acceptable car ces clés sont publiques — la sécurité est dans les Security Rules).
   */
  env: {
    /* Rend les vars Firebase disponibles côté serveur aussi (pour SSR partiel) */
    FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  },
};

module.exports = withPWA(nextConfig);
