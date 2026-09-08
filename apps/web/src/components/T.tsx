"use client";

/**
 * components/T.tsx — Bout de texte traduit, pour insérer une traduction ponctuelle à
 * l'intérieur d'une page Server Component (ex: page.tsx) sans convertir toute la page en
 * client component. Le fetch Prisma reste côté serveur ; seul ce petit nœud de texte
 * s'hydrate côté client pour lire la langue courante.
 */

import { useT, type TranslationKey } from "@/lib/i18n";

export function T({ k }: { k: TranslationKey }): React.ReactElement {
  const t = useT();
  return <>{t[k]}</>;
}
