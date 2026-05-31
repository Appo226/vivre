"use client";

/**
 * components/OfflineIndicator.tsx — Indicateur de statut réseau
 *
 * Affiche une bannière en haut de l'écran quand l'utilisateur perd la connexion.
 * Disparaît automatiquement 3 secondes après le retour de la connexion.
 *
 * Écoute les événements natifs "online" et "offline" du navigateur.
 * Compatible avec le mode standalone PWA (plein écran, pas de barre de statut browser).
 */

import { useState, useEffect } from "react";

export function OfflineIndicator(): React.ReactElement | null {
  const [isOnline,       setIsOnline]       = useState(true);
  const [showRestored,   setShowRestored]   = useState(false);

  useEffect(() => {
    /* État initial — navigator.onLine peut être false au montage */
    setIsOnline(navigator.onLine);

    function handleOffline() {
      setIsOnline(false);
      setShowRestored(false);
    }

    function handleOnline() {
      setIsOnline(true);
      setShowRestored(true);
      /* Masquer le message "connexion rétablie" après 3 secondes */
      setTimeout(() => setShowRestored(false), 3_000);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
    };
  }, []);

  /* Rien à afficher quand tout va bien */
  if (isOnline && !showRestored) return null;

  return (
    <div
      className={[
        "fixed top-0 left-0 right-0 z-[100] px-4 py-2.5",
        "flex items-center justify-center gap-2",
        "text-sm font-semibold text-white",
        "transition-all duration-300",
        isOnline
          ? "bg-green-600" /* Connexion rétablie — vert */
          : "bg-gray-800", /* Hors ligne — sombre */
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="text-base">{isOnline ? "✓" : "📡"}</span>
      <span>
        {isOnline
          ? "Connexion rétablie"
          : "Hors ligne — données en cache disponibles"}
      </span>
    </div>
  );
}
