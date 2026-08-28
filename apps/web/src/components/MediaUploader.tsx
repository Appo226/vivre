"use client";

/**
 * components/MediaUploader.tsx — Upload de photos/affiches d'événement.
 * Minimum 3 exigé avant publication (voir PATCH /api/events/[id]/submit).
 * La première image devient cover_url, les suivantes gallery_urls.
 */

import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";

interface MediaUploaderProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  minRequired?: number;
}

export function MediaUploader({ urls, onChange, minRequired = 3 }: MediaUploaderProps): React.ReactElement {
  const { accessToken } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/uploads/event-media", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken ?? ""}` },
          body: formData,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Échec de l'envoi d'une image");
        }
        const data = (await res.json()) as { url: string };
        uploaded.push(data.url);
      }
      onChange([...urls, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setUploading(false);
    }
  }

  function removeAt(index: number) {
    onChange(urls.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-dark/80 text-white text-[10px] font-jakarta font-semibold px-1.5 py-0.5 rounded">
                Couverture
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center"
              aria-label="Supprimer"
            >
              ×
            </button>
          </div>
        ))}

        <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-green-400 transition-colors">
          <span className="text-2xl">{uploading ? "…" : "+"}</span>
          <span className="text-[10px] text-gray-400 font-dm">Ajouter</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <p className={["text-xs font-dm", urls.length >= minRequired ? "text-green-600" : "text-amber-600"].join(" ")}>
        {urls.length}/{minRequired} photos minimum — photos de l&apos;événement ou affiche officielle
      </p>
    </div>
  );
}
