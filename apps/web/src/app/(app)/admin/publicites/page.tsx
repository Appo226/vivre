"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/publicites — File des campagnes publicitaires.
 *
 * Deux files distinctes :
 *  - "En attente de revue" (pending_review) : approuver (fige le prix) ou rejeter.
 *  - "En attente de paiement" (approved_unpaid) : confirmer la réception du mobile money
 *    manuel — passe la campagne à "paid", elle se diffuse ensuite automatiquement sur sa
 *    fenêtre de dates, sans autre action ici.
 */

import { useEffect, useState, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";

interface Campaign {
  id: string;
  title: string;
  image_url: string;
  media_type: string;
  link_url: string;
  placement: string;
  start_date: string;
  end_date: string;
  price_fcfa: number;
  status: string;
  payment_reference_note: string | null;
  payment_submitted_at: string | null;
  created_at: string;
  advertiser: { id: string; first_name: string | null; last_name: string | null; phone: string };
}

const PLACEMENT_LABELS: Record<string, string> = {
  home_feed: "Section sponsorisée (accueil)",
  browse_tile: "Tuile découverte",
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function ReviewCard({ c, onDecide }: { c: Campaign; onDecide: () => void }): React.ReactElement {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(): Promise<void> {
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/ads/${c.id}/approve`, {});
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  async function reject(): Promise<void> {
    if (note.trim().length < 10) { setError("Motif requis (min. 10 caractères)."); return; }
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/ads/${c.id}/reject`, { reason: note.trim() });
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {c.media_type === "video" ? (
        <video src={c.image_url} className="w-full h-36 object-cover bg-black" controls muted playsInline />
      ) : (
        <img src={c.image_url} alt={c.title} className="w-full h-36 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-jakarta font-bold text-gray-900">{c.title}</p>
            <p className="text-xs text-gray-500">
              {c.advertiser.first_name ?? "—"} {c.advertiser.last_name ?? ""} · {c.advertiser.phone}
            </p>
          </div>
          <span className="text-xs font-jakarta font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            {PLACEMENT_LABELS[c.placement] ?? c.placement}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
        </p>
        <a href={c.link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1A6B3A] underline mt-1 inline-block break-all">
          {c.link_url}
        </a>

        {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

        {rejecting ? (
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif du refus…"
              rows={2}
              className="w-full rounded-xl border border-gray-300 p-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => void reject()} disabled={busy} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                {busy ? "…" : "Confirmer le refus"}
              </button>
              <button onClick={() => setRejecting(false)} className="px-4 text-sm font-semibold text-gray-500">Annuler</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button onClick={() => void approve()} disabled={busy} className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {busy ? "…" : "Approuver"}
            </button>
            <button onClick={() => setRejecting(true)} className="flex-1 bg-white border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl">
              Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentCard({ c, onDecide }: { c: Campaign; onDecide: () => void }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/ads/${c.id}/confirm-payment`, {});
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-jakarta font-bold text-gray-900">{c.title}</p>
          <p className="text-xs text-gray-500">
            {c.advertiser.first_name ?? "—"} {c.advertiser.last_name ?? ""} · {c.advertiser.phone}
          </p>
        </div>
        <p className="price-text text-sm">{c.price_fcfa.toLocaleString("fr-FR")} FCFA</p>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {PLACEMENT_LABELS[c.placement] ?? c.placement}
      </p>
      {c.payment_reference_note ? (
        <p className="text-sm text-gray-700 mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          Réf. transmise par l&apos;annonceur : <strong>{c.payment_reference_note}</strong>
        </p>
      ) : (
        <p className="text-xs text-gray-400 mt-3 italic">Aucune référence transmise pour l&apos;instant.</p>
      )}

      {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      <button
        onClick={() => void confirm()}
        disabled={busy}
        className="mt-4 w-full bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
      >
        {busy ? "…" : "J'ai reçu ce paiement"}
      </button>
    </div>
  );
}

function AdsQueue(): React.ReactElement {
  const [tab, setTab] = useState<"pending_review" | "approved_unpaid">("pending_review");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ campaigns: Campaign[] }>(`/admin/ads?status=${status}`);
      setCampaigns(res.campaigns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(tab); }, [tab, load]);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <AdminHeader title="Publicités" subtitle={`${campaigns.length} ${tab === "pending_review" ? "en attente de revue" : "en attente de paiement"}`} />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-5xl">
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab("pending_review")}
            className={`px-4 py-2 rounded-full text-sm font-jakarta font-semibold ${tab === "pending_review" ? "bg-[#1A6B3A] text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            En attente de revue
          </button>
          <button
            onClick={() => setTab("approved_unpaid")}
            className={`px-4 py-2 rounded-full text-sm font-jakarta font-semibold ${tab === "approved_unpaid" ? "bg-[#1A6B3A] text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            En attente de paiement
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}
        {loading && <p className="text-center text-gray-400 text-sm py-8">Chargement…</p>}
        {!loading && campaigns.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-gray-500 text-sm">Rien ici pour l&apos;instant.</p>
          </div>
        )}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4">
          {campaigns.map((c) =>
            tab === "pending_review" ? (
              <ReviewCard key={c.id} c={c} onDecide={() => void load(tab)} />
            ) : (
              <PaymentCard key={c.id} c={c} onDecide={() => void load(tab)} />
            )
          )}
        </div>
      </div>
    </main>
  );
}

export default function AdminAdsPage(): React.ReactElement {
  return <AdsQueue />;
}
