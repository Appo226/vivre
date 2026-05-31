/**
 * app/(app)/layout.tsx — Layout des pages authentifiées
 *
 * Ce layout enveloppe toutes les pages de l'application (post-connexion).
 * Il ajoute la barre de navigation inférieure (Bottom Navigation) présente
 * sur toutes les pages principales : Accueil, Services, Transport, Food, Profil.
 *
 * La Bottom Navigation suit le modèle des super-apps mobiles (similaire
 * à WeChat, Grab) avec 5 onglets fixes. Elle est sticky (fixée en bas
 * de l'écran) et respecte la safe-area des iPhones avec encoche.
 *
 * Architecture Next.js : ce layout est imbriqué sous le layout racine (app/layout.tsx).
 * Il hérite donc des polices, providers et métadonnées globales.
 */

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { PushProvider } from "@/components/PushProvider";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { InstallPrompt } from "@/components/InstallPrompt";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps): React.ReactElement {
  return (
    <div className="relative min-h-screen">
      {/* Indicateur réseau — bannière en haut quand hors ligne */}
      <OfflineIndicator />

      {/* Initialise les notifications push FCM en arrière-plan */}
      <PushProvider />

      {/* Contenu de la page — padding bas pour ne pas être caché par la nav */}
      <main className="pb-20">
        {children}
      </main>

      {/* Navigation inférieure sticky — présente sur toutes les pages authentifiées */}
      <BottomNav />

      {/* Invite à installer la PWA — apparaît au premier chargement */}
      <InstallPrompt />
    </div>
  );
}
