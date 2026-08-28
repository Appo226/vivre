"use client";

/**
 * components/HeaderProfileAvatar.tsx — Ligne d'accueil du hero (salutation + avatar de profil).
 *
 * L'avatar seul, posé en `absolute` dans le coin, se lisait comme un élément flottant sans
 * rapport avec le reste — "groupé à part", pas intégré. Le combiner avec une salutation dans
 * une vraie ligne flex en fait un bloc d'en-tête délibéré (comme la plupart des apps mobiles
 * — salutation à gauche, avatar à droite), pas une icône égarée dans un coin. Remplace aussi
 * l'icône générique 👤 par la vraie photo de profil (ou des initiales).
 */

import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";

function initials(first: string | null, last: string | null): string {
  const value = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return value || "?";
}

export function HeaderProfileAvatar(): React.ReactElement {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="animate-fade-in flex items-center justify-between gap-3 mb-3">
      <p className="font-dm text-sm text-white/75">
        Bonjour{user?.first_name ? `, ${user.first_name}` : ""} 👋
      </p>
      <Link href="/profile" className="block active:scale-95 transition-transform shrink-0">
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo utilisateur, pas dans /public
          <img
            src={user.avatar_url}
            alt="Profil"
            className="w-9 h-9 rounded-full object-cover ring-2 ring-white/25"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/15 ring-2 ring-white/25 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{initials(user?.first_name ?? null, user?.last_name ?? null)}</span>
          </div>
        )}
      </Link>
    </div>
  );
}
