"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/versements — File des versements organisateurs éligibles au paiement.
 * L'admin fait le virement mobile money manuellement en dehors de VIVRE, puis enregistre
 * la référence ici — aucune intégration de paiement sortant automatisée pour l'instant.
 */

import { useEffect, useState, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";

interface Payout {
  id: string;
  gross_amount_fcfa: number;
  commission_fcfa: number;
  net_amount_fcfa: number;
  status: string;
  eligible_at: string;
  event: { id: string; title: string; ends_at: string };
  organizer: { id: string; first_name: string | null; last_name: string | null; phone: string };
  payout_account: { payout_provider: string; payout_phone: string; payout_account_name: string } | null;
}

function PayoutCard({ p, onPaid }: { p: Payout; onPaid: () => void }): React.ReactElement {
  const [paying, setPaying] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (reference.trim().length < 3) { setError("Référence de transaction requise."); return; }
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/admin/payouts/${p.id}/pay`, { payout_reference: reference.trim() });
      onPaid();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-border-subtle p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-jakarta font-bold text-ink">{p.event.title}</p>
          <p className="text-xs text-ink-soft">
            {p.organizer.first_name ?? "—"} {p.organizer.last_name ?? ""} · {p.organizer.phone}
          </p>
        </div>
        <p className="price-text text-sm">{p.net_amount_fcfa.toLocaleString("fr-FR")} FCFA</p>
      </div>

      <div className="mt-3 text-xs text-ink-soft space-y-1">
        <p>Brut {p.gross_amount_fcfa.toLocaleString("fr-FR")} FCFA − commission {p.commission_fcfa.toLocaleString("fr-FR")} FCFA</p>
        <p>Éligible depuis le {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(p.eligible_at))}</p>
        {p.payout_account ? (
          <p className="text-ink font-semibold">
            → {p.payout_account.payout_provider} · {p.payout_account.payout_phone} · {p.payout_account.payout_account_name}
          </p>
        ) : (
          <p className="text-red-600 font-semibold">⚠️ Aucun compte de versement vérifié pour cet organisateur</p>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      {paying ? (
        <div className="mt-4 flex flex-col gap-2">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Référence de la transaction mobile money…"
            className="w-full rounded-xl border border-border-subtle bg-surface-card text-ink p-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => void submit()} disabled={busy} className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {busy ? "…" : "Confirmer le versement"}
            </button>
            <button onClick={() => setPaying(false)} className="px-4 text-sm font-semibold text-ink-soft">Annuler</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPaying(true)}
          className="mt-4 w-full bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl"
        >
          Marquer comme payé
        </button>
      )}
    </div>
  );
}

function PayoutsQueue(): React.ReactElement {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ payouts: Payout[] }>("/admin/payouts?status=eligible");
      setPayouts(res.payouts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = payouts.reduce((sum, p) => sum + p.net_amount_fcfa, 0);

  return (
    <main className="min-h-screen bg-page pb-12">
      <AdminHeader title="Versements" subtitle={`${payouts.length} éligibles · ${total.toLocaleString("fr-FR")} FCFA`} />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-5xl">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}
        {loading && <p className="text-center text-ink-soft text-sm py-8">Chargement…</p>}
        {!loading && payouts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-ink-soft text-sm">Aucun versement éligible pour l&apos;instant.</p>
          </div>
        )}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4">
          {payouts.map((p) => (
            <PayoutCard key={p.id} p={p} onPaid={() => void load()} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function AdminPayoutsPage(): React.ReactElement {
  return <PayoutsQueue />;
}
