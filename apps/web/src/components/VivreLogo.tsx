/**
 * components/VivreLogo.tsx — Mark + wordmark officiels VIVRE
 *
 * Le mark (ruban vert/rouge dimensionnel noué sur un losange or, remplacé le 2026-08-31
 * par la version glossy fournie par l'utilisateur) vient de la charte graphique validée.
 * `vivre-mark-*.png` (utilisé par manifest.json pour les icônes PWA) garde volontairement
 * une marge transparente — nécessaire comme zone de sécurité pour le masquage d'icône OS,
 * mais ça rendait le ruban visuellement minuscule et éloigné du mot "VIVRE" ici.
 * `vivre-mark-wordmark-*.png` est un recadrage serré du même mark (ratio non-carré, voir
 * MARK_ASPECT_RATIO) — dédié à ce composant uniquement, jamais aux icônes d'app.
 *
 * Le mot "VIVRE" (2026-09-01) N'EST PLUS DU TEXTE LIVE — un essai avec la police Orbitron
 * approchait le style anguleux du lockup fourni par l'utilisateur mais restait une
 * approximation ; l'utilisateur voulait "les images exactes", donc `vivre-wordmark-text-
 * {white,dark}.png` sont des recadrages serrés et détourés (alpha par luminance) extraits
 * directement de ses fichiers sources (AADown/VIVRE Green Red Gold Emblem.png pour la
 * version blanche, AADown/LightbgWelcomescreenconnexion.png pour la version sombre) —
 * même logique que le mark ci-dessus.
 *
 * showTagline=true (hero /auth, SplashScreen) N'ASSEMBLE PLUS mark + mot + tagline + filet
 * côte à côte en React : un premier essai recomposait ces morceaux en ligne (mark à gauche,
 * texte à droite), mais l'utilisateur voulait le mot EXACTEMENT sous le grand V comme dans
 * ses images de référence, pas une réinterprétation en ligne. `vivre-lockup-full-{dark,
 * light}.png` sont donc un recadrage unique du lockup COMPLET (mark + VIVRE + tagline +
 * filet à étincelle, "les choses brillantes en bas") détouré directement depuis les mêmes
 * fichiers sources, dans leurs proportions et positions relatives d'origine — aucune
 * recomposition, donc aucun risque d'écart avec l'image fournie. showTagline=false (nav,
 * sidebar admin, billet) garde le mark + mot côte à côte : ces contextes sont
 * horizontalement contraints, un lockup empilé n'y tiendrait pas.
 */

import Image from "next/image";

const MARK_SIZES = [16, 24, 32, 64, 128, 256, 512, 1024] as const;
/* Mark re-recadré (2026-09-01) depuis la même source précise que le lockup complet et le
   jeu d'icônes PWA (AADown/VIVRE Green Red Gold Emblem.png) — remplace un recadrage plus
   approximatif d'une session précédente, d'où un ratio légèrement différent (1.80 vs 2.04).
   Garder ce fichier et vivre-mark-{tile}-*.png dérivés de la même image source évite tout
   écart entre le mark affiché en-tête (ligne compacte) et celui de l'icône d'installation. */
const MARK_ASPECT_RATIO = 1.8024691358024691; /* largeur / hauteur du recadrage serré */

/* Dimensions natives des recadrages (voir commentaire au-dessus) — légèrement différentes
   entre les deux fichiers sources, donc des ratios distincts plutôt qu'un seul partagé. */
const WORDMARK_TEXT_WHITE = { w: 769, h: 107 };
const WORDMARK_TEXT_DARK = { w: 693, h: 93 };
const LOCKUP_FULL_DARK = { w: 867, h: 643 }; /* fond sombre → mot/tagline en blanc */
const LOCKUP_FULL_LIGHT = { w: 862, h: 609 }; /* fond clair → mot/tagline en sombre */

function closestMarkSize(px: number): (typeof MARK_SIZES)[number] {
  return MARK_SIZES.find((s) => s >= px) ?? 1024;
}

interface VivreLogoProps {
  /** Hauteur du mark en pixels — le wordmark et la tagline sont mis à l'échelle en proportion. */
  size?: number;
  /**
   * "light" = wordmark blanc (fond TOUJOURS sombre, quel que soit le thème — bottom nav,
   * sidebar admin, billet). "dark" = wordmark vert forêt (fond TOUJOURS clair). "auto" =
   * pilote la couleur via CSS (--wordmark-color, voir globals.css) plutôt qu'un choix figé
   * en React — pour les fonds qui changent eux-mêmes avec le thème (hero /auth,
   * SplashScreen). Ne PAS driver "auto" depuis un `useThemeStore()` React côté appelant :
   * ce store a un vrai bug d'hydratation SSR (reste bloqué sur sa valeur par défaut malgré
   * un localStorage/une classe .dark corrects) — "auto" existe justement pour éviter d'y
   * retoucher, en suivant la même classe .dark CSS-pure que le reste du design system.
   */
  variant?: "light" | "dark" | "auto";
  /** Affiche "Découvrez · Réservez · Vivez" sous le wordmark. */
  showTagline?: boolean;
  className?: string;
}

export function VivreLogo({
  size = 40,
  variant = "light",
  showTagline = false,
  className = "",
}: VivreLogoProps): React.ReactElement {
  const markPx = closestMarkSize(size * 2); /* @2x pour les écrans retina */

  /* Composition empilée (mark, "VIVRE", tagline, filet à étincelle) — lockup complet en une
     seule image, voir le commentaire d'en-tête pour pourquoi ça n'est plus assemblé en React. */
  if (showTagline) {
    const lockupHeight = size * 1.93; /* ratio hauteur totale du lockup / hauteur du mark seul, mesuré sur les deux fichiers sources — garde le mark à la même taille visuelle que dans la mise en page compacte ci-dessous, "size" reste bien la hauteur du mark */
    return (
      <div className={`inline-flex flex-col items-center ${className}`}>
        {(variant === "light" || variant === "auto") && (
          <Image
            src="/icons/vivre-lockup-full-dark.png"
            alt="VIVRE — Découvrez · Réservez · Vivez"
            width={Math.round(lockupHeight * (LOCKUP_FULL_DARK.w / LOCKUP_FULL_DARK.h))}
            height={Math.round(lockupHeight)}
            style={{ height: lockupHeight, width: "auto" }}
            className={variant === "auto" ? "hidden dark:block" : undefined}
            priority
          />
        )}
        {(variant === "dark" || variant === "auto") && (
          <Image
            src="/icons/vivre-lockup-full-light.png"
            alt="VIVRE — Découvrez · Réservez · Vivez"
            width={Math.round(lockupHeight * (LOCKUP_FULL_LIGHT.w / LOCKUP_FULL_LIGHT.h))}
            height={Math.round(lockupHeight)}
            style={{ height: lockupHeight, width: "auto" }}
            className={variant === "auto" ? "dark:hidden" : undefined}
            priority
          />
        )}
      </div>
    );
  }

  /* Contextes compacts (nav, sidebar admin, en-tête de billet) — mark + mot côte à côte,
     jamais de tagline/filet ici : pas la place pour un lockup empilé. */
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src={`/icons/vivre-mark-wordmark-${markPx}.png`}
        alt="VIVRE"
        width={Math.round(size * MARK_ASPECT_RATIO)}
        height={size}
        style={{ height: size, width: "auto" }}
        priority
      />
      {(variant === "light" || variant === "auto") && (
        <Image
          src="/icons/vivre-wordmark-text-white.png"
          alt="VIVRE"
          width={Math.round(size * 0.56 * (WORDMARK_TEXT_WHITE.w / WORDMARK_TEXT_WHITE.h))}
          height={Math.round(size * 0.56)}
          style={{ height: size * 0.56, width: "auto" }}
          className={variant === "auto" ? "hidden dark:block" : undefined}
          priority
        />
      )}
      {(variant === "dark" || variant === "auto") && (
        <Image
          src="/icons/vivre-wordmark-text-dark.png"
          alt="VIVRE"
          width={Math.round(size * 0.56 * (WORDMARK_TEXT_DARK.w / WORDMARK_TEXT_DARK.h))}
          height={Math.round(size * 0.56)}
          style={{ height: size * 0.56, width: "auto" }}
          className={variant === "auto" ? "dark:hidden" : undefined}
          priority
        />
      )}
    </div>
  );
}
