/**
 * apps/web/src/app/page.tsx — Page d'accueil de VIVRE (H-001 Hub)
 *
 * Écran H-001 du ScreenMap VIVRE :
 * - Barre de recherche universelle
 * - Ville détectée (ou sélectionnée)
 * - Grille des modules (Transport, Food, Hôtels, Guides, Attractions, Urgences)
 * - Section "Populaire près de vous"
 * - Événements à venir (FESPACO, SIAO)
 * - Bannière promotionnelle
 * - Bottom navigation à 5 onglets
 * - Bouton flottant AI (assistant IA)
 *
 * Server Component — rendu côté serveur pour le SEO.
 * Les sections dynamiques (données utilisateur, géolocalisation) utilisent Suspense.
 *
 * TODO Step 4+: Implémenter les composants interactifs progressivement.
 */

import type { Metadata } from "next";
import AiChat from "@/components/AiChat";
import SearchBar from "@/components/SearchBar";
import { BottomNav } from "@/components/BottomNav";

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
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            {/* TODO: Avatar ou icône User de lucide-react */}
            <span className="text-white text-sm font-jakarta">👤</span>
          </div>
        </div>

        {/* Ville actuelle */}
        <button className="flex items-center gap-1 text-green-100 text-sm mb-4">
          {/* TODO: Icône MapPin */}
          <span>📍</span>
          <span className="font-dm">Ouagadougou</span>
          <span>▾</span>
        </button>

        {/* Barre de recherche universelle */}
        <SearchBar />
      </header>

      {/* === BANNIÈRES PROMOTIONNELLES === */}
      <section className="px-4 pt-5 pb-1">
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
          <a
            href="/course"
            className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#1A6B3A] to-[#0f4222] text-white shadow-md active:scale-95 transition-all"
          >
            <p className="text-2xl mb-1">🚗</p>
            <p className="font-sora font-bold text-sm leading-tight">Première course offerte</p>
            <p className="text-green-200 text-xs mt-1 font-dm">Code : VIVRE1</p>
          </a>
          <a
            href="/food"
            className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#EF2B2D] to-[#b85c00] text-white shadow-md active:scale-95 transition-all"
          >
            <p className="text-2xl mb-1">🍽️</p>
            <p className="font-sora font-bold text-sm leading-tight">Livraison gratuite</p>
            <p className="text-red-100 text-xs mt-1 font-dm">Restaurants partenaires</p>
          </a>
          <a
            href="/hebergement"
            className="flex-shrink-0 w-52 rounded-2xl p-4 bg-gradient-to-br from-[#1A1A2E] to-[#2d4a1e] text-white shadow-md active:scale-95 transition-all"
          >
            <p className="text-2xl mb-1">🏨</p>
            <p className="font-sora font-bold text-sm leading-tight">-20% hébergement</p>
            <p className="text-green-200 text-xs mt-1 font-dm">Ce weekend seulement</p>
          </a>
        </div>
      </section>

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


