/**
 * app/(auth)/layout.tsx — Layout pour les écrans d'authentification VIVRE
 *
 * Les écrans auth ont un design épuré différent du layout principal :
 * - Pas de bottom navigation (BottomNav)
 * - Fond blanc avec dégradé vert VIVRE en haut
 * - Logo centré
 * - Contenu scrollable avec padding bas confortable
 *
 * Les groupes de routes Next.js App Router "(auth)" n'affectent pas l'URL.
 * /app/(auth)/page.tsx → URL : /auth
 * /app/(auth)/verify/page.tsx → URL : /auth/verify
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Connexion | VIVRE",
    template: "%s | VIVRE",
  },
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout minimaliste pour les écrans de connexion.
 * Server Component — pas de hooks.
 */
export default function AuthLayout({ children }: AuthLayoutProps): React.ReactElement {
  return (
    /*
     * min-h-screen = l'écran auth remplit toujours la hauteur du viewport.
     * flex flex-col = organise le contenu verticalement.
     * bg-white = fond blanc (les écrans auth ont leur propre gradient).
     */
    <div className="min-h-screen flex flex-col bg-white">
      {children}
    </div>
  );
}
