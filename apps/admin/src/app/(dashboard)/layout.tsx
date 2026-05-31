"use client";

/**
 * (dashboard)/layout.tsx — Layout principal du dashboard admin
 *
 * Sidebar sombre fixe à gauche + zone de contenu scrollable à droite.
 * Desktop-only (le dashboard admin n'est pas conçu pour mobile).
 */

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

const NAV_ITEMS = [
  { href: "/",            icon: "📊", label: "Vue d'ensemble" },
  { href: "/restaurants", icon: "🍽️", label: "Restaurants" },
  { href: "/drivers",     icon: "🛵", label: "Livreurs" },
  { href: "/payouts",     icon: "💸", label: "Versements" },
  { href: "/pricing",     icon: "🏷️", label: "Tarification" },
];

function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    document.cookie = "vivre_admin_token=; path=/; max-age=0";
    router.push("/auth");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center text-lg">🛡️</div>
          <div>
            <p className="font-bold text-white text-sm">VIVRE Admin</p>
            <p className="text-gray-500 text-xs">{user?.phone ?? "Administrateur"}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Déconnexion */}
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <aside className="w-60 flex-shrink-0">
        <Sidebar />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
