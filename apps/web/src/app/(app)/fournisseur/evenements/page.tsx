"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements — Dashboard organisateur d'événements
 */

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
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
  rejection_reason: string | null;
  publishing_fee_fcfa: number;
  has_paid_publishing: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:            { label: "Brouillon",        color: "text-ink-soft bg-surface-elevated" },
  pending_approval: { label: "En attente",        color: "text-yellow-700 bg-yellow-50" },
  approved:         { label: "Approuvé",          color: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40" },
  rejected:         { label: "Rejeté",            color: "text-red-700 bg-red-50" },
  cancelled:        { label: "Annulé",            color: "text-red-700 bg-red-50" },
  completed:        { label: "Terminé",           color: "text-ink-soft bg-surface-elevated" },
};

function FournisseurEvenementsContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, hasHydrated } = useAuthStore();
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const submitted = searchParams.get("submitted") === "1";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) { router.push("/auth"); return; }
    apiClient
      .get<{ events: MyEvent[] }>("/events/mine")
      .then((r) => setEvents(r.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hasHydrated, accessToken, router]);

  return (
    <div className="mobile-container min-h-screen bg-page pb-24">
      <header className="bg-surface-card border-b border-border-subtle px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-ink-soft">‹</button>
          <h1 className="text-lg font-sora font-bold text-ink">Mes événements</h1>
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
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 text-sm text-green-800 dark:text-green-300 font-dm">
            Événement soumis pour approbation. Notre équipe vous répond sous 48h.
          </div>
        )}

        {loading && [1, 2].map((i) => (
          <div key={i} className="bg-surface-card rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-surface-elevated rounded w-3/4 mb-2" />
            <div className="h-3 bg-surface-elevated rounded w-1/2" />
          </div>
        ))}

        {!loading && events.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-ink-soft font-dm text-sm">Aucun événement créé.</p>
            <Link
              href="/evenements/publier"
              className="mt-4 inline-block bg-green-700 text-white px-6 py-2.5 rounded-full text-sm font-jakarta font-medium"
            >
              Créer un événement
            </Link>
          </div>
        )}

        {events.map((event) => {
          const statusCfg = STATUS_LABELS[event.status] ?? { label: event.status, color: "text-ink-soft bg-surface-elevated" };
          const eventDate = new Date(event.starts_at);
          const totalCapacity = event.ticket_types.reduce((s, t) => s + t.quantity, 0);
          const soldPct = totalCapacity > 0 ? Math.round((event._count.bookings / totalCapacity) * 100) : 0;

          return (
            <div key={event.id} className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden">
              <div className="px-4 py-3 border-b border-border-subtle flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-jakarta font-bold text-ink truncate">{event.title}</p>
                  <p className="text-xs text-ink-soft font-dm">
                    {event.venue_name} · {event.city.name}
                  </p>
                </div>
                <span className={`shrink-0 ml-2 text-xs font-dm px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>

              <div className="px-4 py-3 space-y-2">
                <p className="text-xs text-ink-soft font-dm">
                  📅 {eventDate.toLocaleDateString("fr-BF", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>

                {/* Ticket sales bar */}
                <div>
                  <div className="flex justify-between text-xs font-dm text-ink-soft mb-1">
                    <span>{event._count.bookings} billet{event._count.bookings !== 1 ? "s" : ""} vendus</span>
                    <span>{soldPct}% · {totalCapacity} max</span>
                  </div>
                  <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
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
                      <span key={i} className="text-xs bg-surface-elevated text-ink-soft font-dm px-2 py-0.5 rounded-full border border-border-subtle">
                        {tt.name} · {tt.price_fcfa.toLocaleString()} FCFA
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {event.status === "approved" && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                  <Link
                    href={`/fournisseur/evenements/${event.id}/analytics`}
                    className="text-center border border-border-subtle text-ink text-xs font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    📊 Analytics
                  </Link>
                  <Link
                    href={`/fournisseur/evenements/${event.id}/reservations`}
                    className="text-center border border-border-subtle text-ink text-xs font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    Réservations
                  </Link>
                  <Link
                    href={`/evenements/scanner`}
                    className="text-center border border-green-200 text-green-700 dark:text-green-300 text-xs font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    Scanner
                  </Link>
                  <Link
                    href={`/evenements/${event.id}`}
                    className="text-center bg-green-700 text-white text-xs font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    Voir la page
                  </Link>
                  <Link
                    href={`/fournisseur/evenements/${event.id}/modifier`}
                    className="text-center border border-border-subtle text-ink text-xs font-jakarta font-semibold py-2.5 rounded-xl"
                  >
                    ✏️ Modifier
                  </Link>
                </div>
              )}

              {event.status === "rejected" && <RejectedEventPanel event={event} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * ÉVÉNEMENT REJETÉ — raison + choix : corriger et resoumettre, ou demander un remboursement
 * ============================================================ */

function RejectedEventPanel({ event }: { event: MyEvent }): React.ReactElement {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const hasPaid = event.has_paid_publishing && event.publishing_fee_fcfa > 0;

  async function requestRefund(): Promise<void> {
    setRequesting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ message: string }>(`/events/${event.id}/request-refund`, {});
      setResult(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="px-4 pb-3">
      {event.rejection_reason && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-2 whitespace-pre-wrap">
          {event.rejection_reason}
        </p>
      )}

      {result ? (
        <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg p-2.5">{result}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/fournisseur/evenements/${event.id}/modifier`}
            className="text-center bg-green-700 text-white text-xs font-jakarta font-semibold py-2.5 rounded-xl"
          >
            ✏️ Corriger et resoumettre
          </Link>
          {hasPaid && (
            <button
              onClick={() => void requestRefund()}
              disabled={requesting}
              className="text-center border border-red-200 text-red-600 text-xs font-jakarta font-semibold py-2.5 rounded-xl disabled:opacity-50"
            >
              {requesting ? "…" : "Demander un remboursement"}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
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
