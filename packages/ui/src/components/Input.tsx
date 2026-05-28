/**
 * Input.tsx — Composant champ de saisie du design system VIVRE
 * Intégré avec react-hook-form et Zod pour la validation.
 */

import * as React from "react";

import { cn } from "../lib/utils.js";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label affiché au-dessus du champ */
  label?: string;
  /** Message d'erreur Zod (affiché en rouge sous le champ) */
  error?: string;
  /** Icône ou texte affiché à gauche du champ (ex: "+226" pour le téléphone) */
  leftAddon?: React.ReactNode;
  /** Icône à droite (ex: icône de recherche, œil pour password) */
  rightAddon?: React.ReactNode;
  /** Texte d'aide sous le champ (visible si pas d'erreur) */
  hint?: string;
}

/**
 * Champ de saisie standard du design system VIVRE.
 * Gestion intégrée des états : normal, focus, erreur, disabled.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, leftAddon, rightAddon, hint, id, ...props },
    ref
  ) => {
    /* Générer un ID unique si non fourni (pour associer label et input) */
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;

    return (
      <div className="space-y-1.5">
        {/* Label accessible — cliquable pour focus sur le champ */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 font-dm"
          >
            {label}
            {/* Indicateur requis */}
            {props.required && (
              <span className="ml-1 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        {/* Conteneur du champ avec addons */}
        <div className="relative flex items-center">
          {/* Addon gauche (ex: +226 pour le numéro de téléphone) */}
          {leftAddon && (
            <div className="flex items-center pl-3 pr-2 border border-r-0 border-gray-200 bg-gray-50 rounded-l-card h-11 text-sm text-gray-600 font-dm">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              /* Base */
              "flex h-11 w-full bg-white px-3 py-2",
              "text-sm font-dm text-gray-900 placeholder:text-gray-400",
              "border border-gray-200 outline-none",
              /* Arrondis selon la présence d'addons */
              !leftAddon && !rightAddon && "rounded-card",
              leftAddon && !rightAddon && "rounded-r-card",
              !leftAddon && rightAddon && "rounded-l-card",
              leftAddon && rightAddon && "rounded-none",
              /* Focus */
              "focus:border-green-500 focus:ring-1 focus:ring-green-500",
              /* Erreur */
              error && "border-red-400 focus:border-red-500 focus:ring-red-500",
              /* Disabled */
              "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
              className
            )}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />

          {/* Addon droit (ex: icône de recherche) */}
          {rightAddon && (
            <div className="flex items-center pr-3 pl-2 border border-l-0 border-gray-200 bg-gray-50 rounded-r-card h-11 text-gray-400">
              {rightAddon}
            </div>
          )}
        </div>

        {/* Message d'erreur ou d'aide */}
        {error ? (
          <p
            id={`${inputId}-error`}
            className="text-xs text-red-600 font-dm"
            role="alert"
          >
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-gray-500 font-dm">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
