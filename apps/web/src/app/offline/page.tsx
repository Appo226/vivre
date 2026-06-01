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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
      {/* Icône */}
      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center mb-6">
        <span className="text-5xl">📡</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pas de connexion</h1>
      <p className="text-gray-500 text-sm mb-8 max-w-xs">
        Vérifiez votre connexion internet. Certaines données restent accessibles hors ligne.
      </p>

      {/* Ce qui fonctionne sans internet */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-5 mb-6 text-left">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
          Disponible hors ligne
        </p>
        <ul className="space-y-3">
          {[
            { href: "/urgences", icon: "🆘", label: "Numéros d'urgence", sub: "SAMU · Police · Pompiers" },
            { href: "/transport",  icon: "🚌", label: "Lignes de bus SOTRACO", sub: "Arrêts et horaires" },
            { href: "/services",   icon: "🏛️", label: "Services publics", sub: "Mairies, hôpitaux, pharmacies" },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
                <span className="ml-auto text-gray-300 text-sm">›</span>
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

      <p className="mt-6 text-xs text-gray-400">
        Les pages récemment visitées sont disponibles depuis le cache.
      </p>
    </div>
  );
}
