"use client";

/**
 * components/HomeEventsList.tsx — Liste "À l'affiche" de l'accueil, avec aperçu réduit.
 *
 * N'affiche que PREVIEW_COUNT événements par défaut — le reste du contenu de l'accueil
 * (section sponsorisée, CTA organisateur, urgences) doit rester atteignable sans avoir à
 * défiler toute la liste complète des événements. "Voir tout" déplie le reste sur place,
 * sans navigation — la liste complète reste sur /evenements pour qui veut vraiment parcourir.
 */

import { useState } from "react";
import Link from "next/link";
import { PatriotStar } from "@/components/PatriotStar";

interface HomeEvent {
  id: string;
  title: string;
  slug: string;
  starts_at: Date;
  venue_name: string;
  is_featured: boolean;
  city: { name: string };
  category: { name: string; icon: string | null };
  ticket_types: { price_fcfa: number }[];
}

const PREVIEW_COUNT = 3;

export function HomeEventsList({ events }: { events: HomeEvent[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return (
      <div className="kente-texture rounded-card border border-gray-100 dark:border-dark-700 p-8 text-center">
        <p className="text-3xl mb-2">🎪</p>
        <p className="font-jakarta font-semibold text-gray-700 dark:text-gray-200">Aucun événement pour l&apos;instant</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-dm mt-1">Soyez le premier à en publier un.</p>
      </div>
    );
  }

  const visibleEvents = expanded ? events : events.slice(0, PREVIEW_COUNT);
  const hiddenCount = events.length - PREVIEW_COUNT;

  return (
    <>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:items-start">
        {visibleEvents.map((event) => (
          <Link
            key={event.id}
            href={`/evenements/${event.slug}`}
            className="flex gap-3 rounded-card border border-gray-100 dark:border-dark-700 shadow-card hover:shadow-modal transition-shadow overflow-hidden bg-white dark:bg-dark-800"
          >
            <div className="w-16 h-16 flex-shrink-0 gradient-green flex items-center justify-center text-2xl">
              {event.category.icon ?? "🎫"}
            </div>
            <div className="py-1.5 pr-3 flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-1.5">
                {event.is_featured && <PatriotStar className="w-3 h-3 flex-shrink-0" />}
                <p className="font-jakarta font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-dm truncate">
                {event.venue_name} · {event.city.name} · {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(event.starts_at)}
              </p>
              <p className="price-text text-sm mt-0.5">
                {event.ticket_types[0]?.price_fcfa === 0 || !event.ticket_types[0]
                  ? "Gratuit"
                  : `À partir de ${event.ticket_types[0].price_fcfa.toLocaleString("fr-FR")} FCFA`}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full mt-3 py-2.5 text-sm font-semibold text-[#1A6B3A] dark:text-[#4ADE80] border border-[#1A6B3A]/20 dark:border-[#4ADE80]/30 rounded-xl hover:bg-green-50 dark:hover:bg-dark-700 transition-colors"
        >
          {expanded ? "Voir moins" : `Voir tout (${events.length})`}
        </button>
      )}
    </>
  );
}
