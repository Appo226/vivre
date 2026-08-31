"use client";

export const dynamic = "force-dynamic";

/**
 * /publicite/mes-campagnes — Mes campagnes publicitaires (annonceur).
 * Pour "approved_unpaid" : affiche le prix figé + permet de signaler un paiement mobile
 * money envoyé (référence de transaction) — un admin confirme ensuite la réception.
 */

import React, { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/** useSearchParams() exige une frontière Suspense pour le pré-rendu statique. */
function SubmittedBanner(): React.ReactElement | null {
  const params = useSearchParams();
  if (params.get("submitted") !== "1") return null;
  return (
    <div className="mx-4 mt-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 text-sm text-green-800 dark:text-green-300">
      Campagne soumise ! Vous serez notifié une fois la revue terminée.
    </div>
  );
}

interface Campaign {
  id: string;
  title: string;
  image_url: string;
  media_type: string;
  placement: string;
  start_date: string;
  end_date: string;
  price_fcfa: number;
  status: string;
  rejection_reason: string | null;
  payment_reference_note: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "En attente de revue", color: "text-amber-700 bg-amber-50 border-amber-200" },
  approved_unpaid: { label: "Approuvée — paiement attendu", color: "text-blue-700 bg-blue-50 border-blue-200" },
  paid: { label: "Payée", color: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900" },
  rejected: { label: "Rejetée", color: "text-red-700 bg-red-50 border-red-200" },
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function CampaignCard({ c, onUpdate }: { c: Campaign; onUpdate: () => void }): React.ReactElement {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusCfg = STATUS_LABELS[c.status] ?? { label: c.status, color: "text-ink-soft bg-surface-elevated border-border-subtle" };

  async function submitPayment(): Promise<void> {
    if (note.trim().length < 3) { setError("Ajoutez une référence de transaction."); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.patch(`/ads/${c.id}/submit-payment`, { reference_note: note.trim() });
      onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-surface-card rounded-2xl border border-border-subtle overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.media_type === "video" ? (
        <video src={c.image_url} className="w-full h-32 object-cover bg-black" controls muted playsInline />
      ) : (
        <img src={c.image_url} alt={c.title} className="w-full h-32 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <p className="font-jakarta font-bold text-ink">{c.title}</p>
          <span className={`text-xs font-dm px-2 py-0.5 rounded-full border ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
        <p className="text-xs text-ink-soft font-dm mt-1">
          {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
        </p>

        {c.status === "rejected" && c.rejection_reason && (
          <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg p-2">{c.rejection_reason}</p>
        )}

        {c.status === "approved_unpaid" && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold text-ink">{c.price_fcfa.toLocaleString("fr-FR")} FCFA</p>
            <p className="text-xs text-ink-soft">
              Envoyez le paiement par mobile money au numéro communiqué par l&apos;équipe VIVRE, puis
              indiquez la référence de transaction ci-dessous.
            </p>
            {c.payment_reference_note ? (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                Référence transmise : <strong>{c.payment_reference_note}</strong> — en attente de confirmation.
              </p>
            ) : (
              <>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex : OM-88213"
                  className="w-full border border-border-subtle bg-surface-card text-ink rounded-lg px-3 py-2 text-sm"
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  onClick={() => void submitPayment()}
                  disabled={submitting}
                  className="w-full py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? "…" : "J'ai envoyé le paiement"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyCampaignsPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken, hasHydrated } = useAuthStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiClient.get<{ campaigns: Campaign[] }>("/ads/mine")
      .then((r) => setCampaigns(r.campaigns))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) { router.push("/auth"); return; }
    load();
  }, [hasHydrated, accessToken, router, load]);

  return (
    <div className="mobile-container min-h-screen bg-page pb-8">
      <header className="bg-surface-card border-b border-border-subtle px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-ink-soft text-xl">‹</button>
          <h1 className="text-base font-sora font-bold text-ink">Mes campagnes</h1>
        </div>
      </header>

      <Suspense>
        <SubmittedBanner />
      </Suspense>

      <div className="px-4 pt-4 space-y-3">
        {loading && <p className="text-sm text-ink-soft text-center py-8">Chargement…</p>}
        {!loading && campaigns.length === 0 && (
          <div className="bg-surface-card rounded-2xl p-8 text-center">
            <p className="text-4xl mb-2">📢</p>
            <p className="font-semibold text-ink">Aucune campagne pour l&apos;instant</p>
            <button
              onClick={() => router.push("/publicite/creer")}
              className="mt-3 text-[#1A6B3A] dark:text-green-300 text-sm font-semibold"
            >
              Publier une annonce →
            </button>
          </div>
        )}
        {campaigns.map((c) => (
          <CampaignCard key={c.id} c={c} onUpdate={load} />
        ))}
      </div>
    </div>
  );
}
