"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements — Dashboard organisateur d'événements
 */

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface MyEvent {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  venue_name: string;
  city: { name: string };
  ticket_types: { name: string; price_fcfa: number; quantity: number }[];
  _count: { bookings: number };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:            { label: "Brouillon",        color: "text-gray-600 bg-gray-100" },
  pending_approval: { label: "En attente",        color: "text-yellow-700 bg-yellow-50" },
  approved:         { label: "Approuvé",          color: "text-green-700 bg-green-50" },
  rejected:         { label: "Rejeté",            color: "text-red-700 bg-red-50" },
  cancelled:        { label: "Annulé",            color: "text-red-700 bg-red-50" },
  completed:        { label: "Terminé",           color: "text-gray-600 bg-gray-100" },
};

function FournisseurEvenementsContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const submitted = searchParams.get("submitted") === "1";

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    apiClient
      .get<{ events: MyEvent[] }>("/events/mine")
      .then((r) => setEvents(r.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken, router]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Mes événements</h1>
          <Link
            href="/evenements/publier"
            className="ml-auto bg-green-700 text-white text-sm font-jakarta font-semibold px-3 py-1.5 rounded-full"
          >
            + Créer
          </Link>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {submitted && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-dm">
            Événement soumis pour approbation. Notre équipe vous répond sous 48h.
          </div>
        )}

        {loading && [1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}

        {!loading && events.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-gray-500 font-dm text-sm">Aucun événement créé.</p>
            <Link
              href="/evenements/publier"
              className="mt-4 inline-block bg-green-700 text-white px-6 py-2.5 rounded-full text-sm font-jakarta font-medium"
            >
              Créer un événement
            </Link>
          </div>
        )}

        {events.map((event) => {
          const statusCfg = STATUS_LABELS[event.status] ?? { label: event.status, color: "text-gray-600 bg-gray-100" };
          const eventDate = new Date(event.starts_at);
          const totalCapacity = event.ticket_types.reduce((s, t) => s + t.quantity, 0);
          const soldPct = totalCapacity > 0 ? Math.round((event._count.bookings / totalCapacity) * 100) : 0;

          return (
            <div key={event.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-jakarta font-bold text-gray-900 truncate">{event.title}</p>
                  <p className="text-xs text-gray-500 font-dm">
                    {event.venue_name} · {event.city.name}
                  </p>
                </div>
                <span className={`shrink-0 ml-2 text-xs font-dm px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>

              <div className="px-4 py-3 space-y-2">
                <p className="text-xs text-gray-600 font-dm">
                  📅 {eventDate.toLocaleDateString("fr-BF", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>

                {/* Ticket sales bar */}
                <div>
                  <div className="flex justify-between text-xs font-dm text-gray-500 mb-1">
                    <span>{event._count.bookings} billet{event._count.bookings !== 1 ? "s" : ""} vendus</span>
                    <span>{soldPct}% · {totalCapacity} max</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.min(soldPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Ticket types */}
                {event.ticket_types.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {event.ticket_types.map((tt, i) => (
                      <span key={i} className="text-xs bg-gray-50 text-gray-600 font-dm px-2 py-0.5 rounded-full border border-gray-100">
                        {tt.name} · {tt.price_fcfa.toLocaleString()} FCFA
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {event.status === "approved" && (
                <div className="px-4 pb-3 flex gap-2">
                  <Link
                    href={`/evenements/scanner`}
                    className="flex-1 text-center border border-green-200 text-green-700 text-sm font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    Scanner billets
                  </Link>
                  <Link
                    href={`/evenements/${event.id}`}
                    className="flex-1 text-center bg-green-700 text-white text-sm font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    Voir la page
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FournisseurEvenementsPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <FournisseurEvenementsContent />
    </Suspense>
  );
}
