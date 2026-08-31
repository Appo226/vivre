"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/evenements — File d'approbation des événements payants.
 * Les événements 100% gratuits s'auto-approuvent (voir PATCH /api/events/[id]/submit) —
 * seuls les événements avec au moins un billet payant arrivent ici.
 */

import { useEffect, useState, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";

interface AdminEvent {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  gallery_urls: string[];
  venue_name: string;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  safety_description: string | null;
  expected_profile: string | null;
  city: { name: string };
  category: { name: string };
  organizer: { id: string; first_name: string | null; last_name: string | null; phone: string };
  ticket_types: { name: string; price_fcfa: number; quantity: number }[];
  publishing_fee_fcfa: number;
  has_paid_publishing: boolean;
}

function EventsQueue(): React.ReactElement {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [refundNow, setRefundNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ events: AdminEvent[] }>("/admin/events?status=pending_approval");
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function approve(id: string): Promise<void> {
    setBusyId(id); setError(null);
    try {
      await apiClient.patch(`/events/${id}/approve`, {});
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusyId(null); }
  }

  async function reject(id: string): Promise<void> {
    if (rejectReason.trim().length < 10) { setError("Raison requise (min. 10 caractères)."); return; }
    setBusyId(id); setError(null);
    try {
      await apiClient.patch(`/events/${id}/reject`, { reason: rejectReason.trim(), refund_now: refundNow });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setRejectingId(null); setRejectReason(""); setRefundNow(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusyId(null); }
  }

  return (
    <main className="min-h-screen bg-page pb-12">
      <AdminHeader title="Événements à approuver" subtitle={`${events.length} en attente`} />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-5xl">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}

        {loading && <p className="text-center text-ink-soft text-sm py-8">Chargement…</p>}

        {!loading && events.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-ink-soft text-sm">Aucun événement en attente.</p>
          </div>
        )}

        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {events.map((event) => {
          const photoCount = (event.cover_url ? 1 : 0) + event.gallery_urls.length;
          const isPaid = event.ticket_types.some((tt) => tt.price_fcfa > 0);
          return (
            <div key={event.id} className="bg-surface-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
              {event.cover_url && (
                <div className="h-36 bg-cover bg-center" style={{ backgroundImage: `url(${event.cover_url})` }} />
              )}
              <div className="p-4">
                <p className="font-jakarta font-bold text-ink">{event.title}</p>
                <p className="text-xs text-ink-soft mt-0.5">
                  {event.venue_name} · {event.city.name} · {event.category.name}
                </p>
                <p className="text-xs text-ink-soft mt-0.5">
                  {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at))}
                  {" · "}Capacité {event.max_capacity}
                </p>

                <p className="text-sm text-ink-soft mt-3 whitespace-pre-wrap">{event.description}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {event.ticket_types.map((tt) => (
                    <span key={tt.name} className="text-xs font-semibold bg-surface-elevated border border-border-subtle rounded-full px-2.5 py-1">
                      {tt.name} · {tt.price_fcfa === 0 ? "Gratuit" : `${tt.price_fcfa.toLocaleString("fr-FR")} FCFA`} · {tt.quantity} places
                    </span>
                  ))}
                </div>

                <div className="mt-3 text-xs text-ink-soft space-y-1">
                  <p>📸 {photoCount} photo(s)/affiche(s) {photoCount < 3 && <span className="text-red-600 font-semibold">— insuffisant (min 3)</span>}</p>
                  <p>👤 Organisateur : {event.organizer.first_name ?? "—"} {event.organizer.last_name ?? ""} · {event.organizer.phone}</p>
                  {event.safety_description && <p>🛡️ Sécurité : {event.safety_description}</p>}
                  {event.expected_profile && <p>👥 Public attendu : {event.expected_profile}</p>}
                  {isPaid && <p className="text-amber-700 font-semibold">💰 Billets payants — vérifiez que l&apos;organisateur est bien vérifié avant d&apos;approuver.</p>}
                </div>

                {rejectingId === event.id ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Raison du rejet (visible par l'organisateur)…"
                      rows={2}
                      className="w-full rounded-xl border border-border-subtle p-2.5 text-sm"
                    />
                    {event.has_paid_publishing && event.publishing_fee_fcfa > 0 && (
                      <label className="flex items-start gap-2 text-xs text-ink-soft bg-surface-elevated rounded-lg p-2.5">
                        <input
                          type="checkbox"
                          checked={refundNow}
                          onChange={(e) => setRefundNow(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Rembourser immédiatement les {event.publishing_fee_fcfa.toLocaleString("fr-FR")} FCFA payés
                          (sinon l&apos;organisateur peut corriger et resoumettre sans repayer, ou demander lui-même
                          un remboursement plus tard).
                        </span>
                      </label>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => void reject(event.id)}
                        disabled={busyId === event.id}
                        className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
                      >
                        Confirmer le rejet
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason(""); setRefundNow(false); }}
                        className="px-4 text-sm font-semibold text-ink-soft"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => void approve(event.id)}
                      disabled={busyId === event.id}
                      className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
                    >
                      {busyId === event.id ? "…" : "Approuver"}
                    </button>
                    <button
                      onClick={() => setRejectingId(event.id)}
                      className="flex-1 bg-surface-card border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </main>
  );
}

export default function AdminEventsPage(): React.ReactElement {
  return <EventsQueue />;
}
