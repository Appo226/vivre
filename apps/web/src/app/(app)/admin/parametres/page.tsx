"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/parametres — Paramètres globaux de la plateforme (frais, interrupteurs, délais).
 * Effectif immédiatement pour les nouveaux événements/versements — pas de redéploiement requis.
 */

import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";
import { useAuthStore } from "@/store/auth.store";

interface Settings {
  organizer_fee_percent: number;
  buyer_fee_percent: number;
  buyer_fee_flat_fcfa: number;
  free_period_enabled: boolean;
  discounts_enabled: boolean;
  payout_delay_new_organizer_days: number;
  payout_delay_trusted_organizer_days: number;
  trusted_organizer_event_threshold: number;
  ad_price_home_feed_fcfa_per_day: number;
  ad_price_browse_fcfa_per_day: number;
  event_listing_fee_fcfa: number;
  ad_price_photo_fcfa_per_day: number;
  ad_price_video_fcfa_per_day: number;
  greeting_message: string;
  greeting_message_enabled: boolean;
  home_subtitle: string;
  hero_banner_enabled: boolean;
  hero_banner_media_type: string;
  hero_banner_image_url: string | null;
  hero_banner_link_url: string | null;
}

/* Suggestions de départ pour le message d'accueil — un clic remplit le champ,
   rien n'est enregistré tant que "Enregistrer" n'est pas cliqué. */
const GREETING_SUGGESTIONS = [
  "Contente de vous revoir sur VIVRE !",
  "Prêt à vivre votre prochain événement ?",
  "On est ravis de vous voir ici.",
  "Merci de faire partie de la famille VIVRE.",
  "Que la fête commence !",
];

function NumberField({ label, value, onChange, step = 1, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string;
}): React.ReactElement {
  return (
    <label className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 text-right rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-semibold"
        />
        {suffix && <span className="text-xs text-gray-400 w-8">{suffix}</span>}
      </span>
    </label>
  );
}

function TextField({ label, value, onChange, maxLength, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; maxLength?: number; placeholder?: string;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1.5 py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {maxLength && (
        <span className="text-xs text-gray-400 text-right">{value.length}/{maxLength}</span>
      )}
    </label>
  );
}

function ToggleField({ label, sub, value, onChange }: {
  label: string; sub: string; value: boolean; onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={["w-12 h-7 rounded-full transition-colors relative flex-shrink-0",
          value ? "bg-[#1A6B3A]" : "bg-gray-200"].join(" ")}
      >
        <span className={["absolute top-1 w-5 h-5 rounded-full bg-white transition-transform",
          value ? "translate-x-6" : "translate-x-1"].join(" ")} />
      </button>
    </div>
  );
}

function SettingsForm(): React.ReactElement {
  const { accessToken } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  async function handleBannerUpload(file: File | undefined): Promise<void> {
    if (!file || !settings) return;
    setUploadingBanner(true);
    setBannerError(null);
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
      setSettings({ ...settings, hero_banner_image_url: data.url, hero_banner_media_type: data.media_type });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setUploadingBanner(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<Settings>("/admin/settings");
        setSettings(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Erreur réseau.");
      } finally { setLoading(false); }
    })();
  }, []);

  async function save(): Promise<void> {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiClient.patch("/admin/settings", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau.");
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <AdminHeader title="Paramètres de la plateforme" />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-2xl flex flex-col gap-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
        {loading && <p className="text-center text-gray-400 text-sm py-8">Chargement…</p>}

        {settings && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Interrupteurs</p>
              <ToggleField
                label="Période gratuite"
                sub="Tous les frais à 0%, quel que soit l'événement"
                value={settings.free_period_enabled}
                onChange={(v) => setSettings({ ...settings, free_period_enabled: v })}
              />
              <ToggleField
                label="Codes promo"
                sub="Désactive tous les codes promo, même déjà actifs"
                value={settings.discounts_enabled}
                onChange={(v) => setSettings({ ...settings, discounts_enabled: v })}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Page d&apos;accueil</p>
              <TextField
                label="Sous-titre du hero"
                value={settings.home_subtitle}
                maxLength={160}
                placeholder="Concerts, mariages, kermesses, conférences et bien plus — trouvez votre prochain événement."
                onChange={(v) => setSettings({ ...settings, home_subtitle: v })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Affiché sous « Vivez le Faso. Un billet à la fois. » — garder large, ne pas lister
                seulement quelques catégories.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bannière VIVRE (accueil)</p>
              <ToggleField
                label="Activer la bannière"
                sub="Contenu propre à VIVRE dans le hero de l'accueil — jamais une pub tierce payante"
                value={settings.hero_banner_enabled}
                onChange={(v) => setSettings({ ...settings, hero_banner_enabled: v })}
              />
              <div className="py-3">
                {settings.hero_banner_image_url ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    {settings.hero_banner_media_type === "video" ? (
                      <video src={settings.hero_banner_image_url} className="w-full h-32 object-cover" controls muted playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={settings.hero_banner_image_url} alt="Bannière" className="w-full h-32 object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, hero_banner_image_url: null })}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 cursor-pointer hover:bg-gray-50 text-center px-4">
                    {uploadingBanner ? "Envoi…" : "Choisir une image ou une vidéo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4"
                      className="hidden"
                      disabled={uploadingBanner}
                      onChange={(e) => void handleBannerUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
                {bannerError && <p className="text-xs text-red-600 mt-2">{bannerError}</p>}
              </div>
              <TextField
                label="Lien (optionnel)"
                value={settings.hero_banner_link_url ?? ""}
                placeholder="https://…"
                onChange={(v) => setSettings({ ...settings, hero_banner_link_url: v || null })}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Message d&apos;accueil</p>
              <ToggleField
                label="Afficher le message"
                sub="Sous « Bonjour/Bonsoir, {prénom} » sur le profil de chaque personne connectée"
                value={settings.greeting_message_enabled}
                onChange={(v) => setSettings({ ...settings, greeting_message_enabled: v })}
              />
              <TextField
                label="Texte du message"
                value={settings.greeting_message}
                maxLength={120}
                placeholder="Contente de vous revoir sur VIVRE !"
                onChange={(v) => setSettings({ ...settings, greeting_message: v })}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {GREETING_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSettings({ ...settings, greeting_message: s })}
                    className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Frais</p>
              <NumberField
                label="Commission organisateur"
                value={settings.organizer_fee_percent}
                step={0.5}
                suffix="%"
                onChange={(v) => setSettings({ ...settings, organizer_fee_percent: v })}
              />
              <NumberField
                label="Frais acheteur (%)"
                value={settings.buyer_fee_percent}
                step={0.5}
                suffix="%"
                onChange={(v) => setSettings({ ...settings, buyer_fee_percent: v })}
              />
              <NumberField
                label="Frais acheteur (fixe)"
                value={settings.buyer_fee_flat_fcfa}
                step={50}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, buyer_fee_flat_fcfa: v })}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Délais de versement</p>
              <NumberField
                label="Nouvel organisateur"
                value={settings.payout_delay_new_organizer_days}
                suffix="jours"
                onChange={(v) => setSettings({ ...settings, payout_delay_new_organizer_days: v })}
              />
              <NumberField
                label="Organisateur de confiance"
                value={settings.payout_delay_trusted_organizer_days}
                suffix="jours"
                onChange={(v) => setSettings({ ...settings, payout_delay_trusted_organizer_days: v })}
              />
              <NumberField
                label="Seuil de confiance"
                value={settings.trusted_organizer_event_threshold}
                suffix="évén."
                onChange={(v) => setSettings({ ...settings, trusted_organizer_event_threshold: v })}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Publicité</p>
              <NumberField
                label="Section sponsorisée accueil (par jour)"
                value={settings.ad_price_home_feed_fcfa_per_day}
                step={500}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, ad_price_home_feed_fcfa_per_day: v })}
              />
              <NumberField
                label="Tuile découverte (par jour)"
                value={settings.ad_price_browse_fcfa_per_day}
                step={500}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, ad_price_browse_fcfa_per_day: v })}
              />
              <p className="text-xs text-gray-400 mt-2">
                Figé au moment où vous approuvez une campagne — un changement ici n&apos;affecte
                jamais une campagne déjà approuvée.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Mise en ligne d&apos;événement
              </p>
              <NumberField
                label="Frais de mise en ligne"
                value={settings.event_listing_fee_fcfa}
                step={100}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, event_listing_fee_fcfa: v })}
              />
              <NumberField
                label="Publicité photo (par jour)"
                value={settings.ad_price_photo_fcfa_per_day}
                step={100}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, ad_price_photo_fcfa_per_day: v })}
              />
              <NumberField
                label="Publicité vidéo (par jour)"
                value={settings.ad_price_video_fcfa_per_day}
                step={100}
                suffix="FCFA"
                onChange={(v) => setSettings({ ...settings, ad_price_video_fcfa_per_day: v })}
              />
              <p className="text-xs text-gray-400 mt-2">
                Payé par l&apos;organisateur à la soumission (frais de mise en ligne + jours de
                publicité s&apos;il en ajoute une) — même montant que l&apos;événement soit
                gratuit ou payant. Désactivé entièrement si &quot;Période gratuite&quot; est
                actif ci-dessus.
              </p>
            </div>

            <OrganizerDiscountCard />

            <button
              onClick={() => void save()}
              disabled={saving}
              className="w-full bg-[#1A6B3A] text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

/* Réduction ponctuelle sur les frais d'un organisateur donné — action instantanée, pas liée
 * au bouton "Enregistrer" ci-dessous (qui ne couvre que les réglages globaux). */
function OrganizerDiscountCard(): React.ReactElement {
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState(100);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function apply(): Promise<void> {
    setApplying(true);
    setMessage(null);
    try {
      const res = await apiClient.patch<{ message: string; user: { first_name: string | null; last_name: string | null; phone: string } }>(
        "/admin/organizer-discount",
        { phone: phone.trim(), discount_percent: discount }
      );
      const name = [res.user.first_name, res.user.last_name].filter(Boolean).join(" ") || res.user.phone;
      setMessage({ text: `${name} : réduction de ${discount}% appliquée.`, isError: false });
      setPhone("");
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Erreur réseau.", isError: true });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
        Réduction organisateur (bêta-testeurs, promos)
      </p>
      <p className="text-xs text-gray-400 mb-3">
        Applique une réduction (0-100%) sur les frais de mise en ligne, publicité et commission
        pour UN compte précis, sans toucher aux tarifs de toute la plateforme. 100% = gratuit
        pour lui.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Numéro de téléphone (ex: +22670000000)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={discount}
            onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-20 text-right rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-semibold"
          />
          <span className="text-sm text-gray-500">%</span>
          <button
            onClick={() => void apply()}
            disabled={applying || !phone.trim()}
            className="ml-auto bg-[#1A6B3A] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {applying ? "…" : "Appliquer"}
          </button>
        </div>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.isError ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}
    </div>
  );
}

export default function AdminSettingsPage(): React.ReactElement {
  return <SettingsForm />;
}
