"use client";

/**
 * (dashboard)/layout.tsx — Layout principal du dashboard fournisseur
 *
 * Structure : sidebar fixe à gauche + zone de contenu à droite.
 * La sidebar affiche les liens selon le type de fournisseur (restaurant / hébergement).
 * Sur mobile : sidebar remplacée par une barre de navigation en bas.
 */

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * NAVIGATION
 * ============================================================ */

interface NavItem {
  href:  string;
  icon:  string;
  label: string;
  forType?: "restaurant" | "property" | "both"; /* undefined = tous */
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",            icon: "📊", label: "Tableau de bord" },
  { href: "/commandes",   icon: "📋", label: "Commandes",   forType: "restaurant" },
  { href: "/menu",        icon: "🍽️", label: "Menu",        forType: "restaurant" },
  { href: "/restaurant",  icon: "⚙️", label: "Paramètres",  forType: "restaurant" },
  { href: "/reservations",icon: "🏨", label: "Réservations",forType: "property" },
  { href: "/hebergement", icon: "⚙️", label: "Mon établissement", forType: "property" },
];

/* ============================================================
 * COMPOSANT SIDEBAR
 * ============================================================ */

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();
  const type = user?.supplierType;

  /* Filtrer les liens selon le type de fournisseur */
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.forType) return true;
    if (type === "both") return true;
    return item.forType === type;
  });

  function handleLogout() {
    logout();
    document.cookie = "vivre_supplier_token=; path=/; max-age=0";
    router.push("/auth");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏪</span>
          <div>
            <p className="font-bold text-white text-sm">VIVRE Fournisseur</p>
            <p className="text-gray-400 text-xs truncate max-w-[140px]">
              {user?.first_name ?? user?.phone ?? "Fournisseur"}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            {...(onClose ? { onClick: onClose } : {})}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors
              ${isActive(item.href)
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }
            `}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Pied de page — déconnexion */}
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full"
        >
          <span className="text-lg">🚪</span>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * LAYOUT PRINCIPAL
 * ============================================================ */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── Sidebar desktop (fixe, 256px) ── */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* ── Overlay sidebar mobile ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute left-0 top-0 h-full w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Zone de contenu principale ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header mobile */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <span className="text-xl">☰</span>
          </button>
          <span className="font-bold text-gray-900">VIVRE Fournisseur</span>
        </header>

        {/* Contenu scrollable */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
