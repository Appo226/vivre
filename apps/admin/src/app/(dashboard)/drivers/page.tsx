"use client";

/**
 * drivers/page.tsx — Gestion des candidatures livreurs
 *
 * L'admin peut :
 *   - Approuver un dossier → PATCH /drivers/:id/approve
 *   - Rejeter avec raison → PATCH /drivers/:id/reject
 *
 * Un livreur refusé peut soumettre un nouveau dossier.
 * Un livreur approuvé peut accepter des courses.
 *
 * Documents soumis : identité, permis, photo du véhicule.
 * L'admin les vérifie hors-ligne et approuve/rejette ici.
 */

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Driver {
  id:                 string;
  driver_type:        string;
  vehicle_type:       string;
  vehicle_plate:      string;
  license_number:     string;
  application_status: string;
  rejection_reason:   string | null;
  payout_phone:       string;
  payout_method:      string;
  created_at:         string;
  user: { first_name: string | null; last_name: string | null; phone: string };
  city: { name: string };
}

/* ============================================================
 * MODAL DE REJET
 * ============================================================ */

function RejectModal({
  driverId,
  onClose,
  onRejected,
}: {
  driverId: string;
  onClose:  () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const PRESETS = [
    "Documents illisibles ou incomplets",
    "Permis de conduire expiré ou invalide",
    "Véhicule non conforme aux exigences VIVRE",
    "Informations incohérentes — vérification requise",
    "Zone de livraison non couverte",
  ];

  async function handleReject() {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await apiClient.patch(`/drivers/${driverId}/reject`, { reason });
      onRejected();
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
        <h2 className="text-lg font-bold text-gray-900">Motif de rejet</h2>
        <div className="space-y-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                reason === p
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ou saisir un motif personnalisé…"
            rows={2}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-400 outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={saving || !reason.trim()}
            className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl text-sm hover:bg-red-600 disabled:opacity-50"
          >
            {saving ? "Rejet…" : "Rejeter le dossier"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * COMPOSANT INTERNE
 * ============================================================ */

function DriversContent() {
  const params = useSearchParams();
  const { accessToken } = useAuthStore();

  const [activeStatus, setActiveStatus] = useState(params.get("status") ?? "pending");
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [loading, setLoading]           = useState(true);
  const [approvingId, setApprovingId]   = useState<string | null>(null);
  const [rejectingId, setRejectingId]   = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ drivers: Driver[] }>(
        `/drivers?status=${activeStatus}`
      );
      setDrivers(res.drivers ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeStatus]);

  useEffect(() => { void load(); }, [load]);

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await apiClient.patch(`/drivers/${id}/approve`);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setApprovingId(null);
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    pending:  "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-600",
  };

  const daysAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return diff === 0 ? "aujourd'hui" : `il y a ${diff}j`;
  };

  const PAYOUT_LABELS: Record<string, string> = {
    orange_money: "Orange Money", moov: "Moov Money",
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Livreurs</h1>
        <span className="text-sm text-gray-500">{drivers.length} résultat{drivers.length > 1 ? "s" : ""}</span>
      </div>

      {/* Filtre statut */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "pending",  label: "En attente" },
          { key: "approved", label: "Approuvés" },
          { key: "rejected", label: "Rejetés" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeStatus === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500">Aucun dossier {activeStatus === "pending" ? "en attente" : activeStatus === "rejected" ? "rejeté" : "approuvé"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">
                      {[d.user.first_name, d.user.last_name].filter(Boolean).join(" ") || d.user.phone}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.application_status] ?? ""}`}>
                      {d.application_status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>📞 {d.user.phone}</span>
                    <span>📍 {d.city.name}</span>
                    <span>🛵 {d.vehicle_type} · {d.vehicle_plate}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>Permis : {d.license_number}</span>
                    <span>Paiement : {PAYOUT_LABELS[d.payout_method] ?? d.payout_method} · {d.payout_phone}</span>
                    <span>Inscrit {daysAgo(d.created_at)}</span>
                  </div>
                  {d.rejection_reason && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                      Motif : {d.rejection_reason}
                    </p>
                  )}
                </div>

                {/* Actions uniquement sur les pending */}
                {d.application_status === "pending" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setRejectingId(d.id)}
                      className="px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-xl hover:bg-red-50"
                    >
                      Rejeter
                    </button>
                    <button
                      onClick={() => void handleApprove(d.id)}
                      disabled={approvingId === d.id}
                      className="px-5 py-2 bg-green-500 text-white text-sm font-bold rounded-xl hover:bg-green-600 disabled:opacity-50"
                    >
                      {approvingId === d.id ? "…" : "✓ Approuver"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal rejet */}
      {rejectingId && (
        <RejectModal
          driverId={rejectingId}
          onClose={() => setRejectingId(null)}
          onRejected={() => setDrivers((prev) => prev.filter((d) => d.id !== rejectingId))}
        />
      )}
    </div>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Chargement…</div>}>
      <DriversContent />
    </Suspense>
  );
}
