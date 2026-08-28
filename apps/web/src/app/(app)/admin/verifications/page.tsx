"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/verifications — File de vérification KYC des organisateurs.
 *
 * "Vérifier" exige explicitement deux confirmations manuelles (appel téléphonique passé +
 * nom sur la pièce = nom du compte de versement) — pas d'approbation en un clic, c'est le
 * garde-fou anti-fraude principal avant qu'un organisateur puisse vendre des billets payants.
 */

import { useEffect, useState, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";

interface Verification {
  id: string;
  status: string;
  id_document_type: string;
  id_document_holder_name: string;
  payout_provider: string;
  payout_phone: string;
  payout_account_name: string;
  phone_call_confirmed_at: string | null;
  created_at: string;
  user: { id: string; phone: string; first_name: string | null; last_name: string | null };
}

function VerificationCard({ v, onDecide }: { v: Verification; onDecide: () => void }): React.ReactElement {
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "verify" | "reject">("idle");
  const [callNotes, setCallNotes] = useState("");
  const [nameMatch, setNameMatch] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOnAccountMatches = v.id_document_holder_name.trim().toLowerCase() === v.payout_account_name.trim().toLowerCase();

  async function loadDoc(): Promise<void> {
    if (docUrl) return;
    try {
      const res = await apiClient.get<{ url: string }>(`/admin/organizer-verifications/${v.id}/document-url`);
      setDocUrl(res.url);
    } catch (err) {
      setDocError(err instanceof ApiError ? err.message : "Erreur réseau.");
    }
  }

  async function submitVerify(): Promise<void> {
    if (callNotes.trim().length < 5 || !nameMatch) {
      setError("Notes d'appel (min. 5 caractères) et confirmation de correspondance des noms requises.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/admin/organizer-verifications/${v.id}/decision`, {
        action: "verify", phone_call_notes: callNotes.trim(), name_match_confirmed: true,
      });
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  async function submitReject(): Promise<void> {
    if (rejectReason.trim().length < 10) { setError("Raison requise (min. 10 caractères)."); return; }
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/admin/organizer-verifications/${v.id}/decision`, {
        action: "reject", rejection_reason: rejectReason.trim(),
      });
      onDecide();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="font-jakarta font-bold text-gray-900">
        {v.user.first_name ?? "—"} {v.user.last_name ?? ""}
      </p>
      <p className="text-xs text-gray-500">{v.user.phone}</p>

      <div className="mt-3 text-sm space-y-1.5">
        <p><span className="text-gray-400">Pièce d&apos;identité :</span> {v.id_document_type} — {v.id_document_holder_name}</p>
        <p className={nameOnAccountMatches ? "text-gray-700" : "text-red-600 font-semibold"}>
          <span className="text-gray-400">Compte de versement :</span> {v.payout_provider} · {v.payout_phone} · {v.payout_account_name}
          {!nameOnAccountMatches && " ⚠️ le nom ne correspond pas à la pièce"}
        </p>
      </div>

      {docUrl ? (
        <a href={docUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm font-semibold text-[#1A6B3A] underline">
          Voir la pièce d&apos;identité (lien valable 5 min) →
        </a>
      ) : (
        <button onClick={() => void loadDoc()} className="mt-3 text-sm font-semibold text-[#1A6B3A] underline">
          Charger la pièce d&apos;identité
        </button>
      )}
      {docError && <p className="text-xs text-red-600 mt-1">{docError}</p>}

      {error && <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      {mode === "idle" && (
        <div className="mt-4 flex gap-2">
          <button onClick={() => setMode("verify")} className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl">
            Vérifier
          </button>
          <button onClick={() => setMode("reject")} className="flex-1 bg-white border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl">
            Rejeter
          </button>
        </div>
      )}

      {mode === "verify" && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Confirmer avant d&apos;approuver</p>
          <textarea
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            placeholder="Notes de l'appel téléphonique de confirmation…"
            rows={2}
            className="w-full rounded-xl border border-gray-300 p-2.5 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={nameMatch} onChange={(e) => setNameMatch(e.target.checked)} className="accent-[#1A6B3A]" />
            Le nom sur la pièce correspond au nom du compte de versement
          </label>
          <div className="flex gap-2 mt-1">
            <button onClick={() => void submitVerify()} disabled={busy} className="flex-1 bg-[#1A6B3A] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {busy ? "…" : "Confirmer la vérification"}
            </button>
            <button onClick={() => setMode("idle")} className="px-4 text-sm font-semibold text-gray-500">Annuler</button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet…"
            rows={2}
            className="w-full rounded-xl border border-gray-300 p-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => void submitReject()} disabled={busy} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
              {busy ? "…" : "Confirmer le rejet"}
            </button>
            <button onClick={() => setMode("idle")} className="px-4 text-sm font-semibold text-gray-500">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VerificationsQueue(): React.ReactElement {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ verifications: Verification[] }>("/admin/organizer-verifications?status=pending_review");
      setVerifications(res.verifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <AdminHeader title="Vérifications organisateur" subtitle={`${verifications.length} en attente`} />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-5xl">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}
        {loading && <p className="text-center text-gray-400 text-sm py-8">Chargement…</p>}
        {!loading && verifications.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-gray-500 text-sm">Aucune vérification en attente.</p>
          </div>
        )}
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-4">
          {verifications.map((v) => (
            <VerificationCard key={v.id} v={v} onDecide={() => void load()} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function AdminVerificationsPage(): React.ReactElement {
  return <VerificationsQueue />;
}
