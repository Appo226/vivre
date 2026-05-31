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
            <h1 className="text-2xl font-sora font-bold">VIVRE</h1>
            <p className="text-green-100 text-sm font-dm">Voyager. Manger. Découvrir.</p>
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

      {/* TODO Step 3+: Populaire près de vous, événements, promo banner */}

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

/* ============================================================
 * COMPOSANTS
 * (Seront déplacés dans leurs fichiers propres à l'Étape 2+)
 * ============================================================ */

/**
 * Bottom Navigation — 5 onglets permanents en bas de l'écran.
 * Sticky sur mobile, toujours visible.
 * TODO Step 2: Extraire dans apps/web/src/components/BottomNav.tsx
 */
function BottomNav(): React.ReactElement {
  const tabs = [
    { href: "/", icon: "🏠", label: "Accueil" },
    { href: "/transport", icon: "🚌", label: "Transport" },
    { href: "/food", icon: "🍽️", label: "Repas" },
    { href: "/hotels", icon: "🏨", label: "Hôtels" },
    { href: "/profile", icon: "👤", label: "Profil" },
  ] as const;

  return (
    <nav
      className={[
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-white border-t border-gray-200 shadow-bottom-nav",
        "max-w-md mx-auto",     /* Centré comme le reste du contenu */
      ].join(" ")}
      aria-label="Navigation principale"
    >
      <div className="flex justify-around items-center h-bottom-nav px-2">
        {tabs.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className={[
              "flex flex-col items-center gap-1 py-2 px-3 rounded-md",
              "text-gray-500 hover:text-green-700",
              "transition-colors duration-150",
            ].join(" ")}
          >
            <span className="text-xl" role="img" aria-label={tab.label}>
              {tab.icon}
            </span>
            <span className="text-xs font-jakarta font-medium">{tab.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

