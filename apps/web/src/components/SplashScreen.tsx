/**
 * components/SplashScreen.tsx — Écran de chargement plein écran aux couleurs VIVRE
 *
 * Remplace un flash blanc/vide par un moment de marque pendant les attentes réelles :
 * connexion, inscription (le temps que l'API réponde et que la page suivante charge ses
 * données). `.hero-texture` réutilise le même fond que le header de /auth — cohérence
 * visuelle plutôt qu'un nouvel écran isolé. L'animation est un "souffle" doux (échelle +
 * opacité), pas un spinner générique : signal "en cours" sans rompre l'identité de marque.
 * `motion-safe:` désactive l'animation automatiquement si l'utilisateur a demandé de
 * réduire les animations au niveau OS — pas de media query à dupliquer ici.
 *
 * Conçu pour être aussi le futur écran de démarrage natif (Capacitor) une fois l'app
 * empaquetée pour iOS/Android — mêmes couleurs, même mark, zéro travail de design en plus
 * à ce moment-là.
 */

import { VivreLogo } from "./VivreLogo";

interface SplashScreenProps {
  /** Message court sous le mark — ex: "Connexion…", "Création du compte…" */
  message?: string;
}

export function SplashScreen({ message }: SplashScreenProps): React.ReactElement {
  return (
    <div className="hero-texture fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4">
      <div className="motion-safe:animate-splash-breathe">
        <VivreLogo size={64} variant="auto" showTagline />
      </div>
      {message && (
        <p className="font-jakarta text-sm tracking-wide text-ink-soft">{message}</p>
      )}
    </div>
  );
}
