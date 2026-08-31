"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements/[id]/modifier — Modifier un événement approuvé, OU corriger et
 * resoumettre un événement rejeté.
 *
 * Volontairement limité aux champs informationnels (lieu, description, visuels) — pas les
 * dates (voir le flux de reprogrammation séparé) ni les billets/prix. Chaque acheteur ayant
 * une réservation active est notifié automatiquement (in-app + SMS) par l'API — rien à faire
 * ici de plus que d'appeler PATCH /api/events/:id.
 *
 * Pour un événement REJETÉ : "Enregistrer" enchaîne PATCH /events/:id puis PATCH
 * /events/:id/submit — resoumission en un clic. Le paiement de mise en ligne déjà réglé est
 * réutilisé automatiquement s'il n'a pas été remboursé (voir events/[id]/submit) : pas de
 * seconde facture pour corriger et resoumettre.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { LocationPicker } from "@/components/LocationPicker";
import { MediaUploader } from "@/components/MediaUploader";

interface EventDetail {
  id: string;
  title: string;
  description: string;
  venue_name: string;
  venue_address: string;
  latitude: number;
  longitude: number;
  cover_url: string | null;
  gallery_urls: string[];
  safety_description: string | null;
  status: string;
  rejection_reason: string | null;
}

const inputCls = "w-full border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-surface-card text-ink";

export default function ModifierEvenementPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, hasHydrated } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [status, setStatus] = useState("approved");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient.get<EventDetail>(`/events/${id}`)
      .then((e) => {
        setTitle(e.title);
        setDescription(e.description);
        setVenueName(e.venue_name);
        setVenueAddress(e.venue_address);
        setPosition({ latitude: e.latitude, longitude: e.longitude });
        setMediaUrls([e.cover_url, ...e.gallery_urls].filter((u): u is string => Boolean(u)));
        setStatus(e.status);
        setRejectionReason(e.rejection_reason);
      })
      .catch(() => setError("Impossible de charger l'événement."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) { router.push("/auth"); return; }
    load();
  }, [hasHydrated, accessToken, router, load]);

  async function handleSave(): Promise<void> {
    setError(null);
    setSuccess(null);
    if (title.trim().length < 3) { setError("Titre trop court."); return; }
    if (description.trim().length < 20) { setError("Description trop courte (20 caractères minimum)."); return; }
    if (venueName.trim().length < 2 || venueAddress.trim().length < 5) { setError("Lieu incomplet."); return; }
    if (!position) { setError("Positionnez le lieu sur la carte."); return; }
    if (mediaUrls.length < 3) { setError("Au moins 3 photos requises."); return; }

    setSaving(true);
    try {
      await apiClient.patch<{ message: string }>(`/events/${id}`, {
        title: title.trim(),
        description: description.trim(),
        venue_name: venueName.trim(),
        venue_address: venueAddress.trim(),
        latitude: position.latitude,
        longitude: position.longitude,
        cover_url: mediaUrls[0],
        gallery_urls: mediaUrls.slice(1),
      });

      if (status === "rejected") {
        const submitRes = await apiClient.patch<{ message?: string; payment_token?: string }>(`/events/${id}/submit`, {});
        if (submitRes.payment_token) {
          // Le paiement précédent ne couvre plus le nouveau montant (ex: pub ajoutée) — un
          // nouveau paiement CinetPay est requis. Pas encore géré depuis cette page (le widget
          // de paiement vit dans /evenements/publier) — informer plutôt que de prétendre que
          // c'est terminé.
          setError("Un nouveau paiement est requis pour cette resoumission (montant modifié) — contactez le support pour finaliser.");
          return;
        }
        setSuccess(submitRes.message ?? "Événement resoumis pour approbation.");
        setTimeout(() => router.push("/fournisseur/evenements"), 1800);
      } else {
        setSuccess("Événement modifié.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-soft text-sm">Chargement…</div>;
  }

  return (
    <div className="mobile-container min-h-screen bg-page pb-28">
      <header className="bg-surface-card border-b border-border-subtle px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-ink-soft text-xl">‹</button>
          <h1 className="text-lg font-sora font-bold text-ink">
            {status === "rejected" ? "Corriger et resoumettre" : "Modifier l'événement"}
          </h1>
        </div>
      </header>

      <div className="px-4 py-5 space-y-5">
        {status === "rejected" && rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800 whitespace-pre-wrap">
            <p className="font-semibold mb-1">Motif du rejet :</p>
            {rejectionReason}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
          {status === "rejected"
            ? "Corrigez ce qui a motivé le rejet, puis enregistrez pour resoumettre à l'admin. Si les frais de mise en ligne ont déjà été payés et n'ont pas été remboursés, ils ne seront pas repayés."
            : "Les acheteurs ayant déjà réservé seront automatiquement notifiés (in-app + SMS) de tout changement. La date et les billets ne se modifient pas ici."}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Titre</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Nom du lieu</label>
          <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Adresse</label>
          <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Position sur la carte</label>
          <LocationPicker initialQuery={venueAddress} value={position} onChange={setPosition} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">Photos</label>
          <MediaUploader urls={mediaUrls} onChange={setMediaUrls} />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
        {success && <p className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl p-3">{success}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe-bottom pt-3 bg-surface-card border-t border-border-subtle z-20">
        <div className="mobile-container">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full bg-green-700 text-white font-jakarta font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving
              ? "Enregistrement…"
              : status === "rejected" ? "Enregistrer et resoumettre" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
