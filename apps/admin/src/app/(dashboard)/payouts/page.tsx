"use client";

/**
 * payouts/page.tsx — Monitoring des versements automatiques
 *
 * Les versements sont déclenchés automatiquement quand un livreur
 * les demande — aucune intervention admin requise en conditions normales.
 *
 * Cette page permet à l'admin de :
 *   - Surveiller les versements en cours (processing) et échoués (failed)
 *   - Relancer un versement échoué → POST /admin/payouts/:id/retry
 *   - Corriger le numéro si nécessaire avant le retry
 *   - Actualiser le statut manuellement → POST /admin/payouts/:id/refresh
 *
 * Les statuts "failed" sont les seuls qui nécessitent une attention.
 * "processing" = en cours chez l'opérateur (normal, quelques minutes).
 * "paid" = terminé avec succès.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Payout {
  id:                      string;
  amount_fcfa:             number;
  status:                  string;
  phone_number:            string;
  payment_method:          string;
  provider_transaction_id: string | null;
  failure_reason:          string | null;
  admin_note:              string | null;
  processed_at:            string | null;
  created_at:              string;
  driver: {
    vehicle_type:  string;
    vehicle_plate: string;
    user: { first_name: string | null; last_name: string | null; phone: string };
  };
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const STATUS_TABS = [
  { key: "processing", label: "En cours",  color: "text-blue-600" },
  { key: "failed",     label: "Échoués",   color: "text-red-600" },
  { key: "paid",       label: "Payés",     color: "text-green-600" },
  { key: "all",        label: "Tous",      color: "text-gray-600" },
];

const STATUS_STYLES: Record<string, string> = {
  processing: "bg-blue-100 text-blue-700",
  paid:       "bg-green-100 text-green-700",
  failed:     "bg-red-100 text-red-600",
};

const METHOD_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov:          "Moov Money",
  telecel_money: "Telecel Money",
};

/* ============================================================
 * MODAL RETRY
 * ============================================================ */

function RetryModal({
  payout,
  onClose,
  onRetried,
}: {
  payout:    Payout;
  onClose:   () => void;
  onRetried: (id: string) => void;
}) {
  const [phone, setPhone]     = useState(payout.phone_number);
  const [note, setNote]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const driverName = [payout.driver.user.first_name, payout.driver.user.last_name]
    .filter(Boolean).join(" ") || payout.driver.user.phone;

  async function handleRetry() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/admin/payouts/${payout.id}/retry`, {
        ...(phone !== payout.phone_number ? { phone_number: phone } : {}),
        ...(note.trim() ? { admin_note: note } : {}),
      });
      onRetried(payout.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Relancer le versement</h2>

        {/* Résumé */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Livreur</span>
            <span className="font-medium">{driverName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Montant</span>
            <span className="font-bold text-orange-600">{payout.amount_fcfa.toLocaleString()} FCFA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Via</span>
            <span className="font-medium">{METHOD_LABELS[payout.payment_method] ?? payout.payment_method}</span>
          </div>
          {payout.failure_reason && (
            <div className="pt-1 border-t border-gray-200">
              <p className="text-xs text-red-600">Raison de l'échec : {payout.failure_reason}</p>
            </div>
          )}
        </div>

        {/* Corriger le numéro si nécessaire */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Numéro mobile money
            <span className="text-gray-400 font-normal ml-1">(modifier si incorrect)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Note interne (optionnelle)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Numéro corrigé — ancien numéro ne recevait pas"
            rows={2}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-orange-400 outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={saving || !phone.trim()}
            className="flex-1 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Relance…" : "🔄 Relancer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT LIGNE PAYOUT
 * ============================================================ */

function PayoutRow({
  payout,
  onRetry,
  onRefresh,
}: {
  payout:    Payout;
  onRetry:   (p: Payout) => void;
  onRefresh: (id: string) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const driverName = [payout.driver.user.first_name, payout.driver.user.last_name]
    .filter(Boolean).join(" ") || payout.driver.user.phone;

  const daysAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return diff === 0 ? "aujourd'hui" : `il y a ${diff}j`;
  };

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await apiClient.post(`/admin/payouts/${payout.id}/refresh`);
      onRefresh(payout.id);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900">{driverName}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[payout.status] ?? "bg-gray-100 text-gray-600"}`}>
              {payout.status}
            </span>
          </div>

          <p className="text-2xl font-bold text-orange-600 mt-0.5">
            {payout.amount_fcfa.toLocaleString()} FCFA
          </p>

          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
            <span>📱 {METHOD_LABELS[payout.payment_method] ?? payout.payment_method} · {payout.phone_number}</span>
            <span>🛵 {payout.driver.vehicle_type} · {payout.driver.vehicle_plate}</span>
            <span>⏱ {daysAgo(payout.created_at)}</span>
            {payout.provider_transaction_id && (
              <span className="font-mono text-blue-500">#{payout.provider_transaction_id}</span>
            )}
          </div>

          {payout.failure_reason && (
            <p className="mt-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
              ❌ {payout.failure_reason}
            </p>
          )}
          {payout.admin_note && (
            <p className="mt-1 text-xs text-gray-500 italic">Note : {payout.admin_note}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {payout.status === "processing" && (
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="px-3 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50"
              title="Vérifier le statut chez l'opérateur"
            >
              {refreshing ? "…" : "🔄 Vérifier"}
            </button>
          )}
          {(payout.status === "failed" || payout.status === "processing") && (
            <button
              onClick={() => onRetry(payout)}
              className="px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl hover:bg-orange-600"
            >
              Relancer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function PayoutsPage() {
  const { accessToken } = useAuthStore();

  const [activeTab, setActiveTab]       = useState("processing");
  const [payouts, setPayouts]           = useState<Payout[]>([]);
  const [loading, setLoading]           = useState(true);
  const [retryPayout, setRetryPayout]   = useState<Payout | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ payouts: Payout[] }>(
        `/admin/payouts?status=${activeTab}`
      );
      setPayouts(res.payouts ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTab]);

  useEffect(() => { void load(); }, [load]);

  /* Après retry ou refresh, recharger la liste */
  function handleRetried(id: string) {
    setPayouts((prev) => prev.map((p) => p.id === id ? { ...p, status: "processing" } : p));
  }

  function handleRefreshed(_id: string) {
    /* Recharger depuis l'API pour avoir le nouveau statut */
    void load();
  }

  const failedCount    = payouts.filter((p) => p.status === "failed").length;
  const processingTotal = payouts.filter((p) => p.status === "processing")
    .reduce((s, p) => s + p.amount_fcfa, 0);

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Versements automatiques</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Les versements sont traités automatiquement — Orange Money, Moov Money, Telecel Money.
        </p>
      </div>

      {/* Alerte si des versements ont échoué */}
      {failedCount > 0 && activeTab !== "failed" && (
        <button
          onClick={() => setActiveTab("failed")}
          className="w-full bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-left flex items-center gap-3 hover:bg-red-100"
        >
          <span className="text-xl">❌</span>
          <span className="text-sm font-semibold text-red-700">
            {failedCount} versement{failedCount > 1 ? "s" : ""} échoué{failedCount > 1 ? "s" : ""} — cliquer pour traiter
          </span>
        </button>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats contextuelles */}
      {!loading && activeTab === "processing" && payouts.length > 0 && (
        <p className="text-sm text-blue-600 font-medium">
          {payouts.length} versement{payouts.length > 1 ? "s" : ""} en cours
          · {processingTotal.toLocaleString()} FCFA en transit
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : payouts.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">
            {activeTab === "processing" ? "⏳" : activeTab === "failed" ? "✅" : "📭"}
          </p>
          <p className="text-gray-500">
            {activeTab === "processing" ? "Aucun versement en cours" :
             activeTab === "failed"     ? "Aucun versement échoué" :
             activeTab === "paid"       ? "Aucun versement effectué" :
             "Aucun versement"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => (
            <PayoutRow
              key={p.id}
              payout={p}
              onRetry={setRetryPayout}
              onRefresh={handleRefreshed}
            />
          ))}
        </div>
      )}

      {retryPayout && (
        <RetryModal
          payout={retryPayout}
          onClose={() => setRetryPayout(null)}
          onRetried={handleRetried}
        />
      )}
    </div>
  );
}
