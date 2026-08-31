"use client";

/**
 * app/offline/page.tsx — Page de fallback hors ligne
 *
 * Précachée par next-pwa. Affichée par le Service Worker quand le réseau
 * est indisponible et la page demandée n'est pas en cache.
 */

export const dynamic = "force-static";

export default function OfflinePage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center px-6 text-center">
      {/* Icône */}
      <div className="w-24 h-24 rounded-full bg-surface-elevated flex items-center justify-center mb-6">
        <span className="text-5xl">📡</span>
      </div>

      <h1 className="text-2xl font-bold text-ink mb-2">Pas de connexion</h1>
      <p className="text-ink-soft text-sm mb-8 max-w-xs">
        Vérifiez votre connexion internet. Certaines données restent accessibles hors ligne.
      </p>

      {/* Ce qui fonctionne sans internet */}
      <div className="w-full max-w-sm bg-surface-card rounded-2xl shadow-sm p-5 mb-6 text-left">
        <p className="text-xs font-bold text-ink-soft uppercase tracking-widest mb-3">
          Disponible hors ligne
        </p>
        <ul className="space-y-3">
          {[
            { href: "/urgences", icon: "🆘", label: "Numéros d'urgence", sub: "SAMU · Police · Pompiers" },
            { href: "/services",   icon: "🏛️", label: "Services publics", sub: "Mairies, hôpitaux, pharmacies" },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated hover:bg-surface-elevated transition-colors"
              >
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="font-semibold text-ink text-sm">{item.label}</p>
                  <p className="text-xs text-ink-soft">{item.sub}</p>
                </div>
                <span className="ml-auto text-ink-soft text-sm">›</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Bouton réessayer */}
      <button
        onClick={() => window.location.reload()}
        className="w-full max-w-sm bg-[#1A6B3A] text-white font-bold py-4 rounded-2xl active:scale-95 transition-all"
      >
        Réessayer
      </button>

      <p className="mt-6 text-xs text-ink-soft">
        Les pages récemment visitées sont disponibles depuis le cache.
      </p>
    </div>
  );
}
