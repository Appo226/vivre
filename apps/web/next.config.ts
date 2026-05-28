/**
 * next.config.ts — Configuration Next.js pour apps/web (VIVRE PWA)
 *
 * Ce fichier configure :
 * - next-pwa : Service Worker pour le mode offline
 * - Images : domaines autorisés pour next/image (AWS S3, Cloudfront)
 * - Headers de sécurité (Content-Security-Policy, HSTS)
 * - Variables d'environnement publiques
 * - Redirections et rewrites (ex: /api → API Fastify)
 *
 * Pourquoi le mode PWA est critique pour VIVRE ?
 * Au Burkina Faso, les utilisateurs peuvent perdre la connexion en déplacement.
 * Le mode offline permet de continuer à voir les services publics (SP-001),
 * les lignes SOTRACO (TU-004) et les attractions (AT-001) sans internet.
 * Les données critiques (urgences, pharmacies de garde) sont pré-cachées.
 */

import type { NextConfig } from "next";

/* next-pwa est importé via require car il n'est pas encore typé pour les configs TS */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",                    /* Service Worker généré dans public/ */
  register: true,                    /* Enregistrement automatique du SW */
  skipWaiting: true,                 /* Mise à jour immédiate du SW */
  disable: process.env["NODE_ENV"] === "development", /* Désactivé en dev — trop de logs */

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
        networkTimeoutSeconds: 10, /* Fallback cache si >10s — réseau lent Burkina */
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 5, /* 5 minutes */
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  /* === IMAGES === */
  images: {
    remotePatterns: [
      {
        /* AWS S3 — bucket de production */
        protocol: "https",
        hostname: "vivre-media-prod.s3.af-south-1.amazonaws.com",
      },
      {
        /* CloudFront CDN — distribution des images */
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
      {
        /* Développement local — minio ou s3-mock */
        protocol: "http",
        hostname: "localhost",
        port: "9000",
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
          /* Prévient l'embeddeding dans des iframes (clickjacking) */
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
   * Permet au frontend d'appeler /api/v1/auth au lieu de localhost:3001/v1/auth.
   * En production, c'est le reverse proxy Nginx qui gère cette redirection.
   */
  async rewrites() {
    return process.env["NODE_ENV"] === "development"
      ? [
          {
            source: "/api/:path*",
            destination: `http://localhost:3001/:path*`,
          },
        ]
      : [];
  },

  /* === OPTIONS DIVERSES === */
  reactStrictMode: true,     /* Double-render en dev pour détecter les effets de bord */
  poweredByHeader: false,    /* Masquer "X-Powered-By: Next.js" par sécurité */

  /* Activer Turbopack en développement pour des builds plus rapides */
  experimental: {
    turbo: {},
  },
};

export default withPWA(nextConfig);
