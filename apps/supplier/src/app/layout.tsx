/**
 * Layout racine du dashboard fournisseur VIVRE.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VIVRE Fournisseur — Dashboard",
  robots: { index: false, follow: false },
};

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-100 font-sans antialiased">
        {/* TODO Step 16: Ajouter la sidebar fournisseur */}
        {children}
      </body>
    </html>
  );
}
