"use client";

/**
 * components/HeaderProfileAvatar.tsx — Avatar de profil dans le hero de l'accueil.
 *
 * Remplace l'icône générique 👤 : montre la vraie photo de profil (ou des initiales)
 * directement sur le fond texturé du hero, sans boîte/bordure épaisse — juste un léger
 * anneau pour se détacher du diaporama photo derrière.
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
    <Link href="/profile" className="absolute right-0 top-0 block active:scale-95 transition-transform">
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
  );
}
