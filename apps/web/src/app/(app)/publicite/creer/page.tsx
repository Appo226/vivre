"use client";

export const dynamic = "force-dynamic";

/**
 * /publicite/creer — Soumettre une campagne publicitaire.
 *
 * N'importe quel compte connecté peut soumettre — organisateur boostant son propre
 * événement, ou tiers annonceur. Le tarif actuel (GET /settings/ad-rates) est affiché
 * dès ce formulaire — self-serve réel, pas une soumission à l'aveugle. Le prix facturé
 * au moment de l'approbation reste celui en vigueur ce jour-là (voir PATCH
 * /api/ads/[id]/approve côté serveur) — l'estimation ici peut donc différer si un admin
 * change le tarif entre-temps, ce qui est rare mais possible.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

const inputCls = "w-full border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-surface-card";
const MAX_VIDEO_SECONDS = 15;

/**
 * Format exigé par emplacement — l'annonce doit remplir tout le cadre, jamais en
 * "letterbox" (bandes grises) : plus simple d'exiger le bon ratio à la source que de
 * composer avec n'importe quel format. Seul "home_feed" a un cadre à taille fixe (voir
 * SponsoredSection, aspect-video) ; "browse_tile" hérite de la largeur de grille (comme
 * les vraies affiches d'événements), pas de format unique à imposer.
 */
const REQUIRED_SPEC: Partial<Record<"home_feed" | "browse_tile", { ratio: number; label: string }>> = {
  home_feed: { ratio: 16 / 9, label: "1200 × 675 px (16:9)" },
};
const ASPECT_TOLERANCE = 0.05;

/**
 * Lit la durée d'une vidéo directement dans le navigateur, sans l'envoyer nulle part —
 * évite d'avoir besoin de ffprobe côté serveur juste pour rejeter une vidéo trop longue
 * avant même de démarrer l'upload.
 */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Impossible de lire cette vidéo"));
    };
    video.src = URL.createObjectURL(file);
  });
}

/** Dimensions naturelles d'une image ou d'une vidéo, lues côté client avant l'envoi. */
function readMediaDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de lire ce fichier")); };
      video.src = url;
    } else {
      const img = new window.Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de lire ce fichier")); };
      img.src = url;
    }
  });
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-soft mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function CreateAdPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<"home_feed" | "browse_tile">("home_feed");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rates, setRates] = useState<{ home_feed_fcfa_per_day: number; browse_tile_fcfa_per_day: number } | null>(null);

  useEffect(() => {
    void apiClient
      .get<{ home_feed_fcfa_per_day: number; browse_tile_fcfa_per_day: number }>("/settings/ad-rates")
      .then(setRates)
      .catch(() => { /* le formulaire reste utilisable sans l'estimation de prix */ });
  }, []);

  async function handleUpload(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);

    if (file.type.startsWith("video/")) {
      try {
        const duration = await readVideoDuration(file);
        if (duration > MAX_VIDEO_SECONDS) {
          setError(`Vidéo trop longue (${Math.round(duration)}s) — ${MAX_VIDEO_SECONDS}s maximum.`);
          return;
        }
      } catch {
        setError("Impossible de lire cette vidéo — essayez un autre fichier.");
        return;
      }
    }

    const spec = REQUIRED_SPEC[placement];
    if (spec) {
      try {
        const { width, height } = await readMediaDimensions(file);
        const ratio = width / height;
        if (Math.abs(ratio - spec.ratio) / spec.ratio > ASPECT_TOLERANCE) {
          setError(`Format incorrect (${width} × ${height}px) — cet emplacement exige ${spec.label}. Recadrez votre visuel et réessayez.`);
          return;
        }
      } catch {
        setError("Impossible de lire les dimensions de ce fichier — essayez un autre fichier.");
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/ad-creative", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken ?? ""}` },
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Échec de l'envoi du fichier");
      }
      const data = (await res.json()) as { url: string; media_type: "image" | "video" };
      setImageUrl(data.url);
      setMediaType(data.media_type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (title.trim().length < 3) { setError("Titre trop court."); return; }
    if (!imageUrl) { setError("Ajoutez un visuel."); return; }
    if (!startDate || !endDate) { setError("Choisissez les dates de diffusion."); return; }

    setSubmitting(true);
    try {
      await apiClient.post("/ads", {
        title: title.trim(),
        image_url: imageUrl,
        media_type: mediaType,
        ...(linkUrl.trim() && { link_url: linkUrl.trim() }),
        placement,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
      });
      router.push("/publicite/mes-campagnes?submitted=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la soumission.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mobile-container min-h-screen bg-page pb-28">
      <header className="bg-surface-card border-b border-border-subtle px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-ink-soft text-xl">‹</button>
          <div>
            <h1 className="text-base font-sora font-bold text-ink">Publier une annonce</h1>
            <p className="text-xs text-ink-soft font-dm">Visible après validation admin</p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Field label="Titre (référence interne)" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Promo Festival Août 2026"
            className={inputCls}
            maxLength={100}
          />
        </Field>

        <Field label="Visuel (image ou vidéo)" required>
          {imageUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-border-subtle">
              {mediaType === "video" ? (
                <video src={imageUrl} className="w-full h-40 object-cover" controls muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Visuel de l'annonce" className="w-full h-40 object-cover" />
              )}
              <button
                type="button"
                onClick={() => { setImageUrl(""); setMediaType("image"); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border-subtle rounded-xl text-sm text-ink-soft cursor-pointer hover:bg-surface-elevated text-center px-4">
              {uploading ? "Envoi…" : (
                <>
                  <span>Choisir une image ou une vidéo</span>
                  <span className="text-[11px] text-ink-soft mt-1">Vidéo MP4 uniquement : {MAX_VIDEO_SECONDS}s max, 20 Mo max</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
            </label>
          )}
          {REQUIRED_SPEC[placement] && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              Format exigé pour cet emplacement : <strong>{REQUIRED_SPEC[placement]?.label}</strong> — le visuel remplit
              tout le cadre, sans bande grise ; un fichier au mauvais ratio sera refusé.
            </p>
          )}
        </Field>

        <Field label="Lien de destination (optionnel)">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… — laissez vide si vous n'avez pas de lien"
            className={inputCls}
          />
        </Field>

        <Field label="Emplacement" required>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPlacement("home_feed")}
              className={`px-3 py-3 rounded-xl text-sm font-semibold border ${placement === "home_feed" ? "bg-[#1A6B3A] text-white border-[#1A6B3A]" : "bg-surface-card text-ink-soft border-border-subtle"}`}
            >
              Section sponsorisée (accueil)
            </button>
            <button
              type="button"
              onClick={() => setPlacement("browse_tile")}
              className={`px-3 py-3 rounded-xl text-sm font-semibold border ${placement === "browse_tile" ? "bg-[#1A6B3A] text-white border-[#1A6B3A]" : "bg-surface-card text-ink-soft border-border-subtle"}`}
            >
              Tuile découverte
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Début" required>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fin" required>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {(() => {
          const ratePerDay = rates
            ? placement === "home_feed"
              ? rates.home_feed_fcfa_per_day
              : rates.browse_tile_fcfa_per_day
            : null;
          const days = startDate && endDate
            ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1)
            : null;
          const total = ratePerDay !== null && days !== null ? ratePerDay * days : null;

          return (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3 text-xs text-green-800 dark:text-green-300 font-dm space-y-1">
              {ratePerDay !== null ? (
                <p>
                  Tarif actuel : <strong>{ratePerDay.toLocaleString("fr-FR")} FCFA/jour</strong>
                  {total !== null && days !== null && (
                    <> — {days} jour{days > 1 ? "s" : ""} sélectionné{days > 1 ? "s" : ""} = <strong>{total.toLocaleString("fr-FR")} FCFA</strong></>
                  )}
                </p>
              ) : (
                <p>Chargement du tarif…</p>
              )}
              <p className="text-green-700 dark:text-green-300">
                Vous ne payez qu&apos;après validation du contenu par notre équipe (généralement sous 24h) —
                le tarif facturé est celui en vigueur au moment de l&apos;approbation.
              </p>
            </div>
          );
        })()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe-bottom pt-3 bg-surface-card border-t border-border-subtle z-20">
        <div className="mobile-container">
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="w-full bg-green-700 text-white font-jakarta font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-all"
          >
            {submitting ? "Envoi…" : "Soumettre pour revue"}
          </button>
        </div>
      </div>
    </div>
  );
}
