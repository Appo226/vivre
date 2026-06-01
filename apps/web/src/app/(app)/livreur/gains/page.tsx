"use client";

export const dynamic = "force-dynamic";

/**
 * livreur/gains/page.tsx — Gains et versements livreur VIVRE
 *
 * Vue complète des revenus d'un livreur :
 *   - Solde disponible (total gagné − déjà versé)
 *   - Résumé par période (cette semaine, ce mois, total)
 *   - Historique des versements (pending, processing, paid, rejected)
 *   - Bouton pour demander un versement (seuil minimum : 5 000 FCFA)
 *
 * Logique de calcul côté API :
 *   - Gains bruts = 80% du delivery_fee de chaque commande livrée
 *   - Solde disponible = gains bruts − versements déjà payés (status = "paid")
 *   - Versements en cours (pending/processing) sont informatifs mais n'affectent
 *     pas le solde — le serveur bloque les doubles demandes par période
 *
 * Endpoints utilisés :
 *   GET /drivers/me/earnings → { total_fcfa, deliveries_count, pending_payout_fcfa }
 *   POST /drivers/me/payout  → demande de versement
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface EarningsSummary {
  total_fcfa: number;           /* Gains bruts cumulés (80% delivery_fee) */
  paid_out_fcfa: number;        /* Montant déjà versé (status = paid) */
  available_fcfa: number;       /* Solde disponible = total − paid_out */
  deliveries_count: number;     /* Nombre de livraisons effectuées */
  pending_payout_fcfa: number;  /* Versements en attente (pending/processing) */
  payouts: Payout[];            /* Historique des versements */
}

interface Payout {
  id: string;
  amount_fcfa: number;
  deliveries_count: number;
  period_from: string;
  period_to: string;
  payment_method: string;
  phone_number: string;
  status: string;               /* pending | processing | paid | rejected */
  admin_note: string | null;
  processed_at: string | null;
  created_at: string;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/* Seuil minimum pour déclencher un versement — aligné avec l'API */
const MIN_PAYOUT = 5_000;

/* Options de versement — uniquement mobile money au Burkina Faso */
const PAYOUT_METHODS = [
  { value: "orange_money", label: "Orange Money", icon: "🟠", placeholder: "07X XXX XXX" },
  { value: "moov",         label: "Moov Money",   icon: "🔵", placeholder: "01X XXX XXX" },
];

/* ============================================================
 * COMPOSANTS UTILITAIRES
 * ============================================================ */

/** Badge coloré pour le statut d'un versement */
function PayoutStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:    "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    paid:       "bg-green-100 text-green-700",
    rejected:   "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending:    "En attente",
    processing: "En cours",
    paid:       "Versé ✓",
    rejected:   "Rejeté",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

/** Carte individuelle d'un versement dans l'historique */
function PayoutCard({ payout }: { payout: Payout }) {
  const from = new Date(payout.period_from).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const to   = new Date(payout.period_to).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const methodIcon = PAYOUT_METHODS.find((m) => m.value === payout.payment_method)?.icon ?? "💳";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Montant + méthode */}
          <div className="flex items-center gap-2">
            <span>{methodIcon}</span>
            <p className="font-bold text-gray-900 text-lg">
              {payout.amount_fcfa.toLocaleString()} FCFA
            </p>
          </div>
          {/* Période couverte */}
          <p className="text-xs text-gray-400 mt-0.5">
            Période : {from} → {to} · {payout.deliveries_count} livraison{payout.deliveries_count > 1 ? "s" : ""}
          </p>
          {/* Numéro de réception */}
          <p className="text-xs text-gray-500 mt-0.5">{payout.phone_number}</p>
          {/* Note admin si rejeté */}
          {payout.admin_note && (
            <p className="text-xs text-red-600 mt-1 italic">{payout.admin_note}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <PayoutStatusBadge status={payout.status} />
          {payout.processed_at && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(payout.processed_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * MODALE DE DEMANDE DE VERSEMENT
 * ============================================================ */

interface PayoutModalProps {
  available: number;
  onClose: () => void;
  onSuccess: () => void;
}

function PayoutModal({ available, onClose, onSuccess }: PayoutModalProps) {
  const [method, setMethod]   = useState("orange_money");
  const [phone, setPhone]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError("Entrez votre numéro de téléphone");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      /* apiClient injecte automatiquement le Bearer token */
      await apiClient.post(
        "/drivers/me/payout",
        { payment_method: method, phone_number: phone.trim() }
      );
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedMethod = PAYOUT_METHODS.find((m) => m.value === method);

  return (
    /* Overlay semi-transparent */
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">Demander un versement</h2>
        <p className="text-sm text-gray-500 mb-6">
          Solde disponible : <strong className="text-green-700">{available.toLocaleString()} FCFA</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Méthode de paiement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Via</label>
            <div className="grid grid-cols-2 gap-3">
              {PAYOUT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => { setMethod(m.value); setPhone(""); }}
                  className={`
                    flex items-center gap-2 p-3 rounded-xl border-2 font-semibold text-sm transition-colors
                    ${method === m.value
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-gray-200 text-gray-700"
                    }
                  `}
                >
                  <span className="text-xl">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Numéro de téléphone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numéro {selectedMethod?.label}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={selectedMethod?.placeholder ?? ""}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-wider focus:ring-2 focus:ring-orange-300 outline-none"
            />
          </div>

          {/* Résumé montant */}
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{available.toLocaleString()} FCFA</p>
            <p className="text-xs text-gray-500 mt-1">
              sera transféré sur votre compte {selectedMethod?.label}
            </p>
          </div>

          {/* Erreur */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
          )}

          {/* Boutons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Envoi…" : "Demander"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function GainsPage() {
  const router  = useRouter();
  /* accessToken — nom exact dans AuthState */
  const { accessToken } = useAuthStore();

  const [earnings, setEarnings]     = useState<EarningsSummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  /* --------------------------------------------------------
   * Chargement des gains (sans filtre de période = historique complet)
   * -------------------------------------------------------- */
  const loadEarnings = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiClient.get<EarningsSummary>("/drivers/me/earnings");
      setEarnings(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          router.push("/devenir-livreur");
          return;
        }
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, router]);

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    loadEarnings();
  }, [accessToken, router, loadEarnings]);

  /* Après un versement accepté : recharge les données et affiche confirmation */
  const handlePayoutSuccess = async () => {
    setShowModal(false);
    setSuccessMsg("Demande de versement envoyée ! Notre équipe la traitera sous 24h ouvrées.");
    await loadEarnings();
  };

  /* ============================================================
   * RENDER
   * ============================================================ */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-gray-500">Chargement des gains…</p>
        </div>
      </div>
    );
  }

  /* Peut-on déclencher un versement ? Solde suffisant ET pas de doublon en cours */
  const hasPendingPayout   = (earnings?.pending_payout_fcfa ?? 0) > 0;
  const canRequestPayout   = (earnings?.available_fcfa ?? 0) >= MIN_PAYOUT && !hasPendingPayout;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── En-tête ── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-14 pb-4 flex items-center gap-3">
        <Link href="/livreur" className="text-gray-400 hover:text-gray-700 text-lg">←</Link>
        <h1 className="text-xl font-bold text-gray-900">Mes gains</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* ── Message de succès ── */}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
            ✅ {successMsg}
          </div>
        )}

        {/* ── Message d'erreur ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Solde disponible ── */}
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-green-200 text-sm mb-1">Solde disponible</p>
          <p className="text-4xl font-bold">{(earnings?.available_fcfa ?? 0).toLocaleString()}</p>
          <p className="text-green-200 text-sm">FCFA</p>

          {/* Versement en attente informatif */}
          {hasPendingPayout && (
            <div className="mt-3 bg-white/10 rounded-xl p-3 text-xs">
              ⏳ {earnings!.pending_payout_fcfa.toLocaleString()} FCFA en cours de traitement
            </div>
          )}

          {/* Bouton versement */}
          <button
            onClick={() => canRequestPayout && setShowModal(true)}
            disabled={!canRequestPayout}
            className={`
              mt-4 w-full py-3 rounded-xl font-semibold text-sm transition-all
              ${canRequestPayout
                ? "bg-white text-green-700 hover:bg-green-50 shadow"
                : "bg-white/20 text-white/60 cursor-not-allowed"
              }
            `}
          >
            {hasPendingPayout
              ? "Versement en cours…"
              : (earnings?.available_fcfa ?? 0) < MIN_PAYOUT
                ? `Minimum ${MIN_PAYOUT.toLocaleString()} FCFA pour verser`
                : "Demander un versement"}
          </button>
        </div>

        {/* ── Statistiques globales ── */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Historique</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{earnings?.deliveries_count ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">livraisons</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-2xl font-bold text-orange-600">
                {((earnings?.total_fcfa ?? 0) / 1000).toFixed(1)}k
              </p>
              <p className="text-xs text-gray-400 mt-0.5">FCFA gagnés</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {((earnings?.paid_out_fcfa ?? 0) / 1000).toFixed(1)}k
              </p>
              <p className="text-xs text-gray-400 mt-0.5">FCFA versés</p>
            </div>
          </div>
        </div>

        {/* ── Explication commission ── */}
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-800">
          <p className="font-semibold mb-1">Comment sont calculés vos gains ?</p>
          <p className="text-orange-700">
            Vous recevez <strong>80%</strong> des frais de livraison de chaque commande livrée.
            VIVRE retient 20% pour couvrir la plateforme et l'assurance.
          </p>
        </div>

        {/* ── Historique des versements ── */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Versements</h2>
          {!earnings?.payouts || earnings.payouts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-400 text-sm">Aucun versement pour l'instant</p>
            </div>
          ) : (
            <div className="space-y-3">
              {earnings.payouts.map((p) => (
                <PayoutCard key={p.id} payout={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modale de versement ── */}
      {showModal && earnings && (
        <PayoutModal
          available={earnings.available_fcfa}
          onClose={() => setShowModal(false)}
          onSuccess={handlePayoutSuccess}
        />
      )}
    </div>
  );
}
