/**
 * Card.tsx — Composant card générique du design system VIVRE
 * Conteneur standard pour les résultats de recherche et les sections de contenu.
 */

import * as React from "react";

import { cn } from "../lib/utils.js";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ajoute une ombre portée — défaut: true */
  shadow?: boolean;
  /** Ajoute un effet hover (utile pour les cards cliquables) */
  hoverable?: boolean;
  /** Supprime le padding interne */
  noPadding?: boolean;
}

/**
 * Conteneur card standard du design system VIVRE.
 */
export function Card({
  className,
  shadow = true,
  hoverable = false,
  noPadding = false,
  children,
  ...props
}: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-card bg-white border border-gray-100",
        shadow && "shadow-card",
        hoverable && [
          "cursor-pointer transition-shadow duration-200",
          "hover:shadow-modal active:scale-[0.99]",
        ],
        !noPadding && "p-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** En-tête d'une card */
export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("mb-3", className)} {...props} />;
}

/** Corps d'une card */
export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("space-y-2", className)} {...props} />;
}

/** Pied d'une card — boutons d'action */
export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("mt-4 pt-3 border-t border-gray-100", className)}
      {...props}
    />
  );
}
