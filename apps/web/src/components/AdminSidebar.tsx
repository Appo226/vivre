"use client";

/**
 * components/AdminSidebar.tsx — Navigation latérale persistante pour /admin/* sur desktop.
 *
 * Cachée sous md (768px) — sur mobile chaque page admin garde son propre header avec
 * flèche retour (voir AdminHeader.tsx). Sur desktop, les admins travaillent depuis un
 * ordinateur (approbations, vérifications KYC avec pièce d'identité à l'écran) donc une
 * nav fixe + contenu élargi vaut mieux qu'une colonne mobile étirée dans le vide.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VivreLogo } from "@/components/VivreLogo";
import { useAuthStore } from "@/store/auth.store";

const NAV_ITEMS = [
  { href: "/admin", label: "Vue d'ensemble", icon: "📊", exact: true },
  { href: "/admin/evenements", label: "Événements", icon: "🎟️" },
  { href: "/admin/verifications", label: "Vérifications", icon: "🪪" },
  { href: "/admin/remboursements", label: "Remboursements", icon: "💸" },
  { href: "/admin/versements", label: "Versements", icon: "🏦" },
  { href: "/admin/publicites", label: "Publicités", icon: "📢" },
  { href: "/admin/parametres", label: "Paramètres", icon: "⚙️" },
];

/* Visible uniquement des super-administrateurs — accorder/retirer le rôle admin est
   volontairement hors de portée d'un admin normal (voir /api/admin/team). */
const SUPER_ADMIN_NAV_ITEM = { href: "/admin/equipe", label: "Équipe", icon: "🔑", exact: false };

export function AdminSidebar(): React.ReactElement {
  const pathname = usePathname();
  const isSuperAdmin = useAuthStore((s) => s.hasRole("super_admin"));
  const items = isSuperAdmin ? [...NAV_ITEMS, SUPER_ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 bg-dark text-white">
      <div className="px-5 pt-6 pb-5">
        <VivreLogo size={24} variant="light" />
        <p className="text-white/40 text-xs font-dm mt-1">Administration</p>
      </div>
      <nav className="flex-1 px-3">
        {items.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-jakarta font-medium transition-colors",
                isActive ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/"
        className="mx-3 mb-5 px-3 py-2.5 rounded-xl text-sm font-jakarta font-medium text-white/40 hover:text-white hover:bg-white/5 transition-colors"
      >
        ← Retour à l&apos;app
      </Link>
    </aside>
  );
}
