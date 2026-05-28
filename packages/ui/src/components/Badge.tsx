/**
 * Badge.tsx — Composant badge pour les statuts et labels VIVRE
 *
 * Utilisé pour afficher :
 * - Statuts de réservation (Confirmé, En attente, Annulé)
 * - Labels spéciaux (De garde, Dernières places, Ouvert, Fermé)
 * - Certifications (ONTB Certifié)
 * - Badges UNESCO
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-badge px-2 py-1 text-xs font-semibold font-jakarta",
  {
    variants: {
      variant: {
        /* Vert — succès, confirmé, ouvert, certifié */
        success: "bg-green-100 text-green-800",
        /* Jaune — en attente, info */
        warning: "bg-amber-100 text-amber-800",
        /* Rouge — annulé, fermé, urgence */
        danger: "bg-red-100 text-red-800",
        /* Bleu — informationnel, spécial */
        info: "bg-blue-100 text-blue-800",
        /* Gris — neutre, inactif */
        neutral: "bg-gray-100 text-gray-700",
        /* Or — premium, VIP, UNESCO */
        gold: "bg-amber-50 text-amber-700 border border-amber-200",
        /* Vert foncé solid — ONTB Certifié */
        certified: "bg-green-500 text-white",
      },
      size: {
        sm: "text-xs px-1.5 py-0.5",
        md: "text-xs px-2 py-1",
        lg: "text-sm px-3 py-1.5",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Icône optionnelle affichée à gauche du texte */
  icon?: React.ReactNode;
  /** Point coloré indicateur (ex: vert = ouvert, rouge = fermé) */
  dot?: boolean;
}

/**
 * Badge de statut du design system VIVRE.
 */
export function Badge({
  className,
  variant,
  size,
  icon,
  dot = false,
  children,
  ...props
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {/* Point coloré — souvent utilisé pour "Ouvert maintenant" (vert) */}
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            /* La couleur du dot suit le variant */
            variant === "success" && "bg-green-600",
            variant === "danger" && "bg-red-600",
            variant === "warning" && "bg-amber-600"
          )}
          aria-hidden="true"
        />
      )}

      {icon && <span aria-hidden="true">{icon}</span>}

      {children}
    </span>
  );
}
