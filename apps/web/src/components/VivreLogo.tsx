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
 */

import Image from "next/image";

const MARK_SIZES = [16, 24, 32, 64, 128, 256, 512, 1024] as const;
/* Mark remplacé (2026-08-31) par la version dimensionnelle/glossy fournie par l'utilisateur —
   ruban plus large et plus plat que l'ancien, d'où un ratio très différent (2.04 vs 1.35). */
const MARK_ASPECT_RATIO = 2.0421455938697317; /* largeur / hauteur du recadrage serré */

function closestMarkSize(px: number): (typeof MARK_SIZES)[number] {
  return MARK_SIZES.find((s) => s >= px) ?? 1024;
}

interface VivreLogoProps {
  /** Hauteur du mark en pixels — le wordmark et la tagline sont mis à l'échelle en proportion. */
  size?: number;
  /** "light" = wordmark blanc (fond sombre) ; "dark" = wordmark vert forêt (fond clair). */
  variant?: "light" | "dark";
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
  const wordmarkColor = variant === "light" ? "#FFFFFF" : "#0F2E20";

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
      <div className="flex flex-col justify-center leading-none">
        <span
          className="font-sora font-extrabold tracking-tight"
          style={{ fontSize: size * 0.56, color: wordmarkColor }}
        >
          VIVRE
        </span>
        {showTagline && (
          <span className="font-dm text-[10px] tracking-[0.15em] mt-0.5">
            <span className={variant === "light" ? "text-[#77C28F]" : "text-[#1A6B3A]"}>Découvrez</span>
            <span className={variant === "light" ? "text-white/50" : "text-ink-soft"}> · </span>
            <span className={variant === "light" ? "text-[#F3797A]" : "text-[#EF2B2D]"}>Réservez</span>
            <span className={variant === "light" ? "text-white/50" : "text-ink-soft"}> · </span>
            <span className="text-[#F5A623]">Vivez</span>
          </span>
        )}
      </div>
    </div>
  );
}
