/**
 * Layout racine du dashboard administrateur VIVRE.
 * Desktop-first — pas de bottom nav mobile.
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIVRE Admin — Tableau de bord",
  robots: { index: false, follow: false }, /* Ne pas indexer l'admin en SEO */
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-100 font-sans antialiased">
        {/* TODO Step 18: Ajouter la sidebar admin et le header */}
        {children}
      </body>
    </html>
  );
}
