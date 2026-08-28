/**
 * components/PatriotStar.tsx — Étoile à cinq branches du drapeau burkinabè.
 * Utilisée comme accent graphique (badges "à la une", séparateurs, listes) —
 * signature visuelle plutôt que des puces génériques.
 */

export function PatriotStar({ className = "w-4 h-4", color = "#F5A623" }: { className?: string; color?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill={color}
        d="M12 0l2.63 8.09h8.51l-6.89 5.01 2.63 8.09L12 16.18l-6.88 5.01 2.63-8.09L.86 8.09h8.51z"
      />
    </svg>
  );
}
