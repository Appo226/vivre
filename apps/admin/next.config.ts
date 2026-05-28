/**
 * next.config.ts — Configuration Next.js pour apps/admin
 * Dashboard administrateur VIVRE — desktop-first, pas de PWA.
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
