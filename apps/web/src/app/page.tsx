/**
 * apps/web/src/app/page.tsx — Page d'accueil de VIVRE (H-001 Hub)
 *
 * Écran H-001 du ScreenMap VIVRE :
 * - Barre de recherche universelle
 * - Ville détectée (ou sélectionnée) via CitySelector
 * - Grille des modules (Transport, Food, Hôtels, Guides, Attractions, Urgences)
 * - Bannières marketing dynamiques via MarketingBanners
 * - Section Urgences + Rejoindre VIVRE
 * - Bottom navigation à 5 onglets
 * - Bouton flottant AI (assistant IA)
 *
 * Server Component — les composants clients sont importés directement,
 * Next.js gère la frontière RSC automatiquement.
 */

import type { Metadata } from "next";
import Link from "next/link";
import AiChat from "@/components/AiChat";
import SearchBar from "@/components/SearchBar";
import { BottomNav } from "@/components/BottomNav";
import CitySelector from "@/components/CitySelector";
import MarketingBanners from "@/components/MarketingBanners";

/* Métadonnées spécifiques à la page d'accueil */
export const metadata: Metadata = {
  title: "VIVRE — Voyager. Manger. Découvrir. au Burkina Faso",
};

/**
 * Page d'accueil — Hub principal de l'application VIVRE.
 * Point d'entrée vers tous les modules : transport, food, hôtels, guides, urgences, AI.
 */
export default function HomePage(): React.ReactElement {
  return (
    <main className="mobile-container min-h-screen">
      {/* === HEADER === */}
      <header className="gradient-green text-white pt-safe-top px-4 pb-6">
        {/* Logo + salutation */}
        <div className="flex items-center justify-between mb-4 pt-4">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" width="110" height="32" viewBox="0 0 280 72">
              <rect x="10" y="10" width="52" height="52" rx="13" fill="rgba(255,255,255,0.25)"/>
              <path d="M21 22 L36 52 L51 22" stroke="#FFFFFF" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="36" cy="52" r="4.5" fill="#F5A623"/>
              <text x="74" y="44" fontFamily="'Sora',sans-serif" fontWeight="800" fontSize="34" fill="#FFFFFF" letterSpacing="-1">VIVRE</text>
            </svg>
          </div>
          {/* Avatar utilisateur ou bouton connexion */}
          <Link href="/profile">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-sm font-jakarta">👤</span>
            </div>
          </Link>
        </div>

        {/* Ville actuelle — sélecteur interactif */}
        <CitySelector />

        {/* Barre de recherche universelle */}
        <SearchBar />
      </header>

      {/* === BANNIÈRES MARKETING (statiques + dynamiques) === */}
      <MarketingBanners />

      {/* === GRILLE DES MODULES === */}
      <section className="px-4 py-6">
        <h2 className="text-lg font-sora font-bold text-gray-900 mb-4">
          Que cherchez-vous ?
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {MODULE_CARDS.map((module) => (
            <a
              key={module.id}
              href={module.href}
              className={[
                "flex flex-col items-center gap-2 p-3",
                "rounded-card border border-gray-100 shadow-card",
                "hover:border-green-200 hover:shadow-modal",
                "transition-all duration-200 active:scale-95",
              ].join(" ")}
            >
              <span className="text-2xl" role="img" aria-label={module.label}>
                {module.icon}
              </span>
              <span className="text-xs font-jakarta font-medium text-gray-700 text-center">
                {module.label}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* === SECTION URGENCES (toujours visible) === */}
      <section className="px-4 mb-6">
        <a
          href="/urgences"
          className={[
            "flex items-center gap-3 p-4",
            "bg-red-50 border border-red-200 rounded-card",
            "hover:bg-red-100 transition-colors",
          ].join(" ")}
        >
          <span className="text-2xl">🆘</span>
          <div>
            <p className="font-jakarta font-bold text-red-700 text-sm">
              Numéros d{"'"}urgence
            </p>
            <p className="text-red-500 text-xs font-dm">
              SAMU 15 · Police 17 · Pompiers 18
            </p>
          </div>
          <span className="ml-auto text-red-400">›</span>
        </a>
      </section>

      {/* === REJOIGNEZ VIVRE === */}
      <section className="px-4 mb-6">
        <h2 className="text-lg font-sora font-bold text-gray-900 mb-3">
          Rejoignez VIVRE
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="/devenir-livreur"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#1A6B3A]/10 border border-[#1A6B3A]/20 hover:bg-[#1A6B3A]/15 active:scale-95 transition-all text-center"
          >
            <span className="text-3xl">🛵</span>
            <p className="font-jakarta font-bold text-sm text-[#1A6B3A] leading-tight">Devenir livreur</p>
            <p className="text-xs text-gray-500 font-dm">Gagnez à votre rythme</p>
          </a>
          <a
            href="/fournisseur/restaurant"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#F5A623]/10 border border-[#F5A623]/30 hover:bg-[#F5A623]/15 active:scale-95 transition-all text-center"
          >
            <span className="text-3xl">🏪</span>
            <p className="font-jakarta font-bold text-sm text-[#b87415] leading-tight">Publier votre établissement</p>
            <p className="text-xs text-gray-500 font-dm">Restaurants & hôtels</p>
          </a>
          <a
            href="/devenir-livreur"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#1A6B3A]/10 border border-[#1A6B3A]/20 hover:bg-[#1A6B3A]/15 active:scale-95 transition-all text-center"
          >
            <span className="text-3xl">🚕</span>
            <p className="font-jakarta font-bold text-sm text-[#1A6B3A] leading-tight">Devenir chauffeur</p>
            <p className="text-xs text-gray-500 font-dm">Taxi · Zémidjan · Transport</p>
          </a>
          <a
            href="/evenements/publier"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#6B21A8]/10 border border-[#6B21A8]/20 hover:bg-[#6B21A8]/15 active:scale-95 transition-all text-center"
          >
            <span className="text-3xl">🎟️</span>
            <p className="font-jakarta font-bold text-sm text-[#6B21A8] leading-tight">Organiser un événement</p>
            <p className="text-xs text-gray-500 font-dm">FESPACO · SIAO · concerts</p>
          </a>
        </div>
      </section>

      {/* === ESPACE POUR LA BOTTOM NAVIGATION === */}
      <div className="h-bottom-nav" aria-hidden="true" />

      {/* === BOTTOM NAVIGATION === */}
      <BottomNav />

      {/* === ASSISTANT IA === */}
      <AiChat />
    </main>
  );
}

/* ============================================================
 * DONNÉES DES MODULES
 * ============================================================ */

/** Modules de la grille H-001 */
const MODULE_CARDS = [
  { id: "course",      href: "/course",    icon: "🛵", label: "Course" },
  { id: "food",        href: "/food",      icon: "🍽️", label: "Repas" },
  { id: "hotels",      href: "/hebergement", icon: "🏨", label: "Hôtels" },
  { id: "transport",   href: "/transport", icon: "🚌", label: "Voyage" },
  { id: "evenements",  href: "/evenements",icon: "🎟️", label: "Événements" },
  { id: "guides",      href: "/guides",    icon: "🗺️", label: "Guides" },
  { id: "urgences",    href: "/urgences",  icon: "🏥", label: "Urgences" },
] as const;


