/**
 * Button.tsx — Composant bouton principal du design system VIVRE
 *
 * Variants disponibles :
 * - primary   : bouton vert VIVRE (#1A6B3A) — action principale
 * - secondary : bouton gris neutre — action secondaire
 * - danger    : bouton rouge (#EF2B2D) — actions destructives (annuler, supprimer)
 * - ghost     : bouton transparent — actions tertiaires
 * - outline   : bordure seulement — pour les filtres et tags
 *
 * Sizes disponibles :
 * - sm  : compact pour les badges cliquables
 * - md  : taille standard (défaut)
 * - lg  : boutons d'action principaux (CTA)
 * - xl  : boutons pleine largeur pour mobile
 *
 * Le composant supporte un état "loading" avec spinner animé.
 * Pendant le loading, le bouton est désactivé pour éviter les double-clics
 * — important pour les paiements Orange Money où un double-clic = double débit.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "../lib/utils.js";

/* ============================================================
 * DÉFINITION DES VARIANTS
 * cva() = class-variance-authority, gère les combinaisons variant + size
 * ============================================================ */

const buttonVariants = cva(
  /* Classes de base — appliquées à tous les variants */
  [
    "inline-flex items-center justify-center gap-2",
    "font-jakarta font-semibold rounded-card",
    "transition-all duration-200 ease-in-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-95", /* Feedback tactile — important pour mobile */
  ].join(" "),
  {
    variants: {
      variant: {
        /* Bouton vert principal — réservations, paiements, actions positives */
        primary: [
          "bg-green-500 text-white",
          "hover:bg-green-600 active:bg-green-700",
          "focus-visible:ring-green-500",
          "shadow-sm hover:shadow-md",
        ].join(" "),

        /* Bouton neutre — actions secondaires, retour, filtres */
        secondary: [
          "bg-gray-100 text-gray-900",
          "hover:bg-gray-200 active:bg-gray-300",
          "focus-visible:ring-gray-500",
        ].join(" "),

        /* Bouton rouge — annulations, suppressions (à utiliser avec modération) */
        danger: [
          "bg-red-500 text-white",
          "hover:bg-red-600 active:bg-red-700",
          "focus-visible:ring-red-500",
        ].join(" "),

        /* Bouton transparent — navigation, actions discrètes */
        ghost: [
          "text-green-700",
          "hover:bg-green-50 active:bg-green-100",
          "focus-visible:ring-green-500",
        ].join(" "),

        /* Bouton avec bordure — filtres, tags actifs */
        outline: [
          "border-2 border-green-500 text-green-700",
          "hover:bg-green-50 active:bg-green-100",
          "focus-visible:ring-green-500",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        /* xl = pleine largeur pour les CTA mobiles (Réserver, Payer, etc.) */
        xl: "h-14 px-8 text-lg w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

/* ============================================================
 * PROPS DU COMPOSANT
 * ============================================================ */

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Affiche un spinner et désactive le bouton pendant un chargement */
  isLoading?: boolean;
  /** Icône à afficher à gauche du texte */
  leftIcon?: React.ReactNode;
  /** Icône à afficher à droite du texte */
  rightIcon?: React.ReactNode;
}

/* ============================================================
 * COMPOSANT
 * ============================================================ */

/**
 * Bouton principal du design system VIVRE.
 * Utiliser ce composant au lieu d'un <button> natif pour garantir la cohérence visuelle.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        /* Désactivé si en loading OU si explicitement disabled */
        disabled={disabled ?? isLoading}
        {...props}
      >
        {/* Spinner de chargement — remplace l'icône gauche si present */}
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon
        )}

        {children}

        {/* Icône droite — jamais affichée pendant le loading */}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

/* Export des variants pour être réutilisé dans d'autres composants */
export { buttonVariants };
