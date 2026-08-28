"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/remboursements — File des demandes de remboursement événements.
 * "Effectué" enregistre que l'admin a déjà fait le virement retour manuellement — aucun
 * argent ne bouge automatiquement depuis cette page (pas d'intégration mobile money sortante).
 */

import { useEffect, useState, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";

interface Refund {
  id: string;
  amount: number;
  reason: string;
  status: string;
  refund_method: string;
  booking_id: string;
  created_at: string;
  payment: { user: { first_name: string | null; last_name: string | null; phone: string } } | null;
}

function RefundCard({ r, onDecide }: { r: Refund; onDecide: () => void }): React.ReactElement {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete(): Promise<void> {
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/admin/refunds/${r.id}/decision`, { action: "complete" });
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  async function reject(): Promise<void> {
    if (note.trim().length < 5) { setError("Motif requis (min. 5 caractères)."); return; }
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/admin/refunds/${r.id}/decision`, { action: "reject", rejection_note: note.trim() });
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-jakarta font-bold text-gray-900">
            {r.payment?.user.first_name ?? "—"} {r.payment?.user.last_name ?? ""}
          </p>
          <p className="text-xs text-gray-500">{r.payment?.user.phone}</p>
        </div>
        <p className="price-text text-sm">{r.amount.toLocaleString("fr-FR")} FCFA</p>
      </div>
      <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{r.reason}</p>
      <p className="text-xs text-gray-400 mt-2">
        Méthode : {r.refund_method} · {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(r.created_at))}
      </p>

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
          <button onClick={() => void complete()} disabled={busy} className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
            {busy ? "…" : "Virement effectué"}
          </button>
          <button onClick={() => setRejecting(true)} className="flex-1 bg-white border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl">
            Refuser
          </button>
        </div>
      )}
    </div>
  );
}

function RefundsQueue(): React.ReactElement {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ refunds: Refund[] }>("/admin/refunds?status=pending");
      setRefunds(res.refunds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <AdminHeader title="Remboursements" subtitle={`${refunds.length} en attente`} />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-5xl">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}
        {loading && <p className="text-center text-gray-400 text-sm py-8">Chargement…</p>}
        {!loading && refunds.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-gray-500 text-sm">Aucun remboursement en attente.</p>
          </div>
        )}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4">
          {refunds.map((r) => (
            <RefundCard key={r.id} r={r} onDecide={() => void load()} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function AdminRefundsPage(): React.ReactElement {
  return <RefundsQueue />;
}
