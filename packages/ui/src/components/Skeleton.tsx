/**
 * Skeleton.tsx — Composant de chargement skeleton pour VIVRE
 *
 * Pourquoi un skeleton et pas un spinner ?
 * Au Burkina Faso, la connexion internet peut être lente (2G/3G en dehors de Ouaga).
 * Un skeleton maintient la structure visuelle de la page pendant le chargement,
 * réduisant l'anxiété de l'utilisateur et rendant l'application plus "perceived fast".
 * Un spinner vide est anxiogène et ne donne aucune information sur ce qui arrive.
 *
 * L'animation pulse est subtile (opacity 1 → 0.4 → 1) pour ne pas distraire.
 */

import * as React from "react";

import { cn } from "../lib/utils.js";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hauteur du skeleton en pixels ou classe Tailwind */
  height?: number | string;
  /** Largeur du skeleton — "full" = 100% */
  width?: number | string | "full";
  /** Arrondi — "none" | "sm" | "md" | "lg" | "full" */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
}

/**
 * Bloc skeleton animé pour indiquer un état de chargement.
 * @example
 *   <Skeleton height={20} width="full" rounded="md" />
 *   <Skeleton height={100} width={200} rounded="lg" />
 */
export function Skeleton({
  className,
  height,
  width,
  rounded = "md",
  style,
  ...props
}: SkeletonProps): React.ReactElement {
  const roundedClass = {
    none: "",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-card",
    full: "rounded-full",
  }[rounded];

  return (
    <div
      className={cn(
        "animate-skeleton-pulse bg-gray-200",
        roundedClass,
        width === "full" && "w-full",
        className
      )}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width:
          width !== "full"
            ? typeof width === "number"
              ? `${width}px`
              : width
            : undefined,
        ...style,
      }}
      aria-hidden="true" /* Le skeleton n'a pas de contenu accessible */
      {...props}
    />
  );
}

/* ============================================================
 * SKELETONS PRÉ-COMPOSÉS
 * Utilisés dans les listes de résultats lors du chargement
 * ============================================================ */

/**
 * Skeleton d'une card de résultat (hôtel, restaurant, bus).
 * Reproduit la structure visuelle d'une card de résultat.
 */
export function CardSkeleton(): React.ReactElement {
  return (
    <div className="rounded-card border border-gray-100 p-4 space-y-3">
      {/* Image de couverture */}
      <Skeleton height={180} width="full" rounded="md" />
      {/* Titre */}
      <Skeleton height={20} width="60%" />
      {/* Description courte */}
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="50%" />
      {/* Prix et rating */}
      <div className="flex justify-between items-center pt-1">
        <Skeleton height={18} width={100} />
        <Skeleton height={18} width={60} rounded="full" />
      </div>
    </div>
  );
}

/**
 * Skeleton d'une ligne de liste (services publics, lignes de bus).
 */
export function ListItemSkeleton(): React.ReactElement {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100">
      {/* Icône circulaire */}
      <Skeleton height={44} width={44} rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton height={16} width="70%" />
        <Skeleton height={12} width="50%" />
      </div>
      <Skeleton height={24} width={60} rounded="full" />
    </div>
  );
}
