"use client";

export const dynamic = "force-dynamic";

/**
 * /fournisseur/evenements/[id]/modifier — Modifier un événement déjà approuvé.
 *
 * Volontairement limité aux champs informationnels (lieu, description, visuels) — pas les
 * dates (voir le flux de reprogrammation séparé) ni les billets/prix. Chaque acheteur ayant
 * une réservation active est notifié automatiquement (in-app + SMS) par l'API — rien à faire
 * ici de plus que d'appeler PATCH /api/events/:id.
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
}

const inputCls = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white text-gray-900";

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

  const load = useCallback(() => {
    apiClient.get<EventDetail>(`/events/${id}`)
      .then((e) => {
        setTitle(e.title);
        setDescription(e.description);
        setVenueName(e.venue_name);
        setVenueAddress(e.venue_address);
        setPosition({ latitude: e.latitude, longitude: e.longitude });
        setMediaUrls([e.cover_url, ...e.gallery_urls].filter((u): u is string => Boolean(u)));
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
      const res = await apiClient.patch<{ message: string }>(`/events/${id}`, {
        title: title.trim(),
        description: description.trim(),
        venue_name: venueName.trim(),
        venue_address: venueAddress.trim(),
        latitude: position.latitude,
        longitude: position.longitude,
        cover_url: mediaUrls[0],
        gallery_urls: mediaUrls.slice(1),
      });
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Chargement…</div>;
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500 text-xl">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Modifier l&apos;événement</h1>
        </div>
      </header>

      <div className="px-4 py-5 space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
          Les acheteurs ayant déjà réservé seront automatiquement notifiés (in-app + SMS) de tout
          changement. La date et les billets ne se modifient pas ici.
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Titre</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nom du lieu</label>
          <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Adresse</label>
          <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Position sur la carte</label>
          <LocationPicker initialQuery={venueAddress} value={position} onChange={setPosition} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Photos</label>
          <MediaUploader urls={mediaUrls} onChange={setMediaUrls} />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{success}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe-bottom pt-3 bg-white border-t border-gray-100 z-20">
        <div className="mobile-container">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full bg-green-700 text-white font-jakarta font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
