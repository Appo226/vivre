"use client";

export const dynamic = "force-dynamic";

/**
 * /evenements/publier — Formulaire de création d'événement (organisateurs)
 *
 * Flux :
 *   1. POST /events              → crée en "draft", retourne event.id
 *   2. PATCH /events/:id/submit  → calcule le total (frais de mise en ligne + pub
 *      optionnelle), initie CinetPay si > 0 (payment_token, pas de redirection)
 *   3. Si payment_token : widget CinetPay seamless intégré à la page, puis on attend la
 *      confirmation (webhook CinetPay → événement passe en "pending_approval") avant de
 *      rediriger — le webhook est la seule source de vérité, jamais le seul callback JS.
 *   4. Redirection → /fournisseur/evenements
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { LocationPicker } from "@/components/LocationPicker";
import { MediaUploader } from "@/components/MediaUploader";

const CINETPAY_SEAMLESS_SRC = "https://cdn.cinetpay.com/seamless/main.js";

/** Injecte le SDK CinetPay seamless une seule fois (mis en cache par le navigateur ensuite). */
function loadCinetPaySeamlessScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${CINETPAY_SEAMLESS_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = CINETPAY_SEAMLESS_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger le module de paiement CinetPay"));
    document.head.appendChild(script);
  });
}

/**
 * Ouvre le widget de paiement CinetPay directement dans la page (pas de redirection vers un
 * site externe — c'est le mode "seamless"). Se résout quand le widget se ferme, que le
 * paiement ait réussi ou non — la confirmation réelle vient du webhook CinetPay côté serveur
 * (voir waitForEventPending), jamais de ce seul callback front.
 */
async function openCinetPaySeamless(paymentToken: string): Promise<void> {
  await loadCinetPaySeamlessScript();
  const seamless = (window as unknown as {
    CinetPaySeamless?: { open: (opts: { paymentToken: string; onClose?: () => void }) => void };
  }).CinetPaySeamless;
  if (!seamless) {
    throw new Error("Module de paiement indisponible — réessayez dans un instant.");
  }
  await new Promise<void>((resolve) => {
    seamless.open({ paymentToken, onClose: () => resolve() });
  });
}

/**
 * Attend que le webhook CinetPay ait confirmé le paiement (l'événement passe de "draft" à
 * "pending_approval" côté serveur) — interroge /events/mine toutes les 3s, jusqu'à 2 minutes.
 * Si le délai expire, on redirige quand même : la confirmation arrivera par notification
 * (SMS/email/in-app) même si personne ne regarde encore l'écran.
 */
async function waitForEventPending(eventId: string): Promise<void> {
  const maxAttempts = 40; // ~2 min à 3s d'intervalle
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await apiClient.get<{ events: { id: string; status: string }[] }>("/events/mine?limit=5");
      const match = res.events.find((e) => e.id === eventId);
      if (match && match.status !== "draft") return;
    } catch {
      // Réseau instable — on retente au prochain tour plutôt que d'abandonner tout de suite.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

/* ============================================================
 * TYPES
 * ============================================================ */

interface City     { id: string; name: string }
interface Category { id: string; name: string; icon: string }
interface ListingPricing {
  free_period_enabled: boolean;
  listing_fee_fcfa: number;
  ad_price_photo_fcfa_per_day: number;
  ad_price_video_fcfa_per_day: number;
}

/* Valeur choisie dans le <select> Ville pour déclencher les champs "nouvelle ville" —
   ne collide jamais avec un vrai UUID de City. */
const NEW_CITY_SENTINEL = "__new__";

interface TicketDraft {
  name:          string;
  price_fcfa:    string;
  quantity:      string;
  max_per_order: string;
  description:   string;
  /* Places numérotées — chaque billet reçoit un numéro de place automatique à l'achat. */
  is_seated: boolean;
  /* Saisie libre séparée par virgules — parsée en tableau à la soumission */
  included_items_raw:  string;
  variant_options_raw: string;
}

interface MerchDraft {
  name:                string;
  price_fcfa:          string;
  quantity:            string;
  description:         string;
  variant_options_raw: string;
}

interface FormState {
  title:                    string;
  category_id:              string;
  additional_category_ids:  string[];
  city_id:            string;
  /* Renseignés seulement si city_id === NEW_CITY_SENTINEL — ville créée à la soumission,
     une fois les coordonnées du lieu (step 2) disponibles pour la géolocaliser. */
  new_city_name:      string;
  new_city_region:    string;
  description:        string;
  venue_name:         string;
  venue_address:      string;
  latitude:           number | null;
  longitude:          number | null;
  starts_at:          string; /* valeur d'un <input type="datetime-local"> */
  ends_at:            string;
  max_capacity:       string;
  safety_description: string;
  expected_profile:   string;
  media_urls:         string[]; /* [0] = cover_url, le reste = gallery_urls */
  ticket_types:       TicketDraft[];
  merch_items:        MerchDraft[];
}

const BLANK_TICKET: TicketDraft = {
  name: "", price_fcfa: "", quantity: "", max_per_order: "10", description: "",
  is_seated: false,
  included_items_raw: "", variant_options_raw: "",
};

const BLANK_MERCH: MerchDraft = {
  name: "", price_fcfa: "", quantity: "", description: "", variant_options_raw: "",
};

/** "1 T-shirt, Cocktail offert" → ["1 T-shirt", "Cocktail offert"] — ignore les entrées vides. */
function parseCommaList(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const INITIAL_FORM: FormState = {
  title: "", category_id: "", additional_category_ids: [], city_id: "",
  new_city_name: "", new_city_region: "", description: "",
  venue_name: "", venue_address: "", latitude: null, longitude: null,
  starts_at: "", ends_at: "", max_capacity: "",
  safety_description: "", expected_profile: "",
  media_urls: [],
  ticket_types: [{ ...BLANK_TICKET }],
  merch_items: [],
};

/* ============================================================
 * HELPERS
 * ============================================================ */

/** Convertit un datetime-local string en ISO 8601 avec timezone Ouaga (UTC+0). */
function toISO(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

/* ============================================================
 * SOUS-COMPOSANTS
 * ============================================================ */

function StepIndicator({ step, total }: { step: number; total: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <div className={[
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
            i + 1 === step  ? "bg-green-700 text-white"
            : i + 1 < step  ? "bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200"
            : "bg-surface-elevated text-ink-soft",
          ].join(" ")}>
            {i + 1 < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div className={["flex-1 h-0.5 max-w-10", i + 1 < step ? "bg-green-300 dark:bg-green-800" : "bg-surface-elevated"].join(" ")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-soft mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-surface-card text-ink";
const selectCls = inputCls + " appearance-none";

/* ============================================================
 * PAGE
 * ============================================================ */

export default function PublierEvenementPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken, hasHydrated } = useAuthStore();

  const [step,       setStep]       = useState(1);
  const [form,       setForm]       = useState<FormState>(INITIAL_FORM);
  const [cities,     setCities]     = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pricing, setPricing] = useState<ListingPricing | null>(null);
  const [adEnabled, setAdEnabled] = useState(false);
  const [adMediaUrl, setAdMediaUrl] = useState("");
  const [adMediaType, setAdMediaType] = useState<"image" | "video">("image");
  const [adUploading, setAdUploading] = useState(false);
  const [adDays, setAdDays] = useState(7);
  const [payingMessage, setPayingMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return; // store encore en train de relire localStorage — pas encore fiable
    if (!accessToken) { router.push("/auth"); return; }
    void Promise.all([
      apiClient.get<{ cities: City[] }>("/cities"),
      apiClient.get<{ categories: Category[] }>("/events/categories"),
      apiClient.get<ListingPricing>("/events/listing-pricing"),
    ]).then(([c, cat, p]) => {
      setCities(c.cities);
      setCategories(cat.categories);
      setPricing(p);
    }).catch(() => {});
  }, [hasHydrated, accessToken, router]);

  async function handleAdUpload(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setAdUploading(true);
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
      setAdMediaUrl(data.url);
      setAdMediaType(data.media_type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setAdUploading(false);
    }
  }

  const adFeePerDay = pricing ? (adMediaType === "video" ? pricing.ad_price_video_fcfa_per_day : pricing.ad_price_photo_fcfa_per_day) : 0;
  const adTotal = adEnabled ? adFeePerDay * adDays : 0;
  const grandTotal = (pricing?.listing_fee_fcfa ?? 0) + adTotal;

  /* ---- helpers de mise à jour ---- */

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setTicket(idx: number, key: keyof TicketDraft, value: string | boolean) {
    setForm((f) => {
      const tickets = [...f.ticket_types];
      tickets[idx] = { ...tickets[idx]!, [key]: value };
      return { ...f, ticket_types: tickets };
    });
  }

  function addTicket() {
    setForm((f) => ({ ...f, ticket_types: [...f.ticket_types, { ...BLANK_TICKET }] }));
  }

  function removeTicket(idx: number) {
    setForm((f) => ({ ...f, ticket_types: f.ticket_types.filter((_, i) => i !== idx) }));
  }

  function setMerch(idx: number, key: keyof MerchDraft, value: string) {
    setForm((f) => {
      const items = [...f.merch_items];
      items[idx] = { ...items[idx]!, [key]: value };
      return { ...f, merch_items: items };
    });
  }

  function addMerch() {
    setForm((f) => ({ ...f, merch_items: [...f.merch_items, { ...BLANK_MERCH }] }));
  }

  function removeMerch(idx: number) {
    setForm((f) => ({ ...f, merch_items: f.merch_items.filter((_, i) => i !== idx) }));
  }

  /* ---- validation par étape ---- */

  function validateStep1(): string | null {
    if (!form.title.trim() || form.title.trim().length < 3)
      return "Le titre doit faire au moins 3 caractères.";
    if (!form.category_id) return "Sélectionnez une catégorie.";
    if (!form.city_id)     return "Sélectionnez une ville.";
    if (form.city_id === NEW_CITY_SENTINEL) {
      if (!form.new_city_name.trim())   return "Indiquez le nom de votre ville.";
      if (!form.new_city_region.trim()) return "Indiquez la région de votre ville.";
    }
    if (!form.description.trim() || form.description.trim().length < 20)
      return "La description doit faire au moins 20 caractères.";
    return null;
  }

  function validateStep2(): string | null {
    if (!form.venue_name.trim()) return "Saisissez le nom du lieu.";
    if (!form.venue_address.trim() || form.venue_address.trim().length < 5)
      return "Saisissez l'adresse complète du lieu.";
    if (form.latitude === null || form.longitude === null)
      return "Positionnez le lieu exact sur la carte — recherchez l'adresse ou touchez la carte.";
    if (!form.starts_at) return "Sélectionnez la date de début.";
    if (!form.ends_at)   return "Sélectionnez la date de fin.";
    const start = new Date(form.starts_at);
    const end   = new Date(form.ends_at);
    if (start <= new Date()) return "La date de début doit être dans le futur.";
    if (end <= start)        return "La date de fin doit être après la date de début.";
    if (!form.max_capacity || Number(form.max_capacity) < 1)
      return "La capacité maximale doit être au moins 1.";
    return null;
  }

  function validateStep3(): string | null {
    if (form.media_urls.length < 3)
      return "Ajoutez au moins 3 photos ou affiches de votre événement.";
    return null;
  }

  function validateStep4(): string | null {
    for (let i = 0; i < form.ticket_types.length; i++) {
      const t = form.ticket_types[i]!;
      if (!t.name.trim()) return `Billet ${i + 1} : saisissez un nom.`;
      if (t.price_fcfa === "" || Number(t.price_fcfa) < 0)
        return `Billet ${i + 1} : prix invalide (0 = gratuit).`;
      if (!t.quantity || Number(t.quantity) < 1)
        return `Billet ${i + 1} : quantité doit être au moins 1.`;
    }
    for (let i = 0; i < form.merch_items.length; i++) {
      const m = form.merch_items[i]!;
      if (!m.name.trim()) return `Produit ${i + 1} : saisissez un nom.`;
      if (m.price_fcfa === "" || Number(m.price_fcfa) < 0)
        return `Produit ${i + 1} : prix invalide.`;
      if (!m.quantity || Number(m.quantity) < 1)
        return `Produit ${i + 1} : quantité doit être au moins 1.`;
    }
    return null;
  }

  function nextStep() {
    setError(null);
    const validators = [validateStep1, validateStep2, validateStep3];
    const err = validators[step - 1]?.();
    if (err) { setError(err); return; }
    setStep((s) => s + 1);
  }

  /* ---- soumission finale ---- */

  async function handleSubmit(): Promise<void> {
    setError(null);
    const err = validateStep4();
    if (err) { setError(err); return; }

    setSubmitting(true);
    try {
      /* Ville créée à la volée si besoin — on ne connaît les coordonnées du lieu (step 2)
         qu'à ce stade, donc la création de la ville est différée jusqu'ici. */
      let resolvedCityId = form.city_id;
      if (resolvedCityId === NEW_CITY_SENTINEL) {
        const { city } = await apiClient.post<{ city: { id: string } }>("/cities", {
          name: form.new_city_name.trim(),
          region: form.new_city_region.trim(),
          latitude: form.latitude,
          longitude: form.longitude,
        });
        resolvedCityId = city.id;
      }

      const payload = {
        title:              form.title.trim(),
        category_id:        form.category_id,
        additional_category_ids: form.additional_category_ids,
        city_id:            resolvedCityId,
        description:        form.description.trim(),
        venue_name:         form.venue_name.trim(),
        venue_address:      form.venue_address.trim(),
        latitude:           form.latitude as number,
        longitude:          form.longitude as number,
        starts_at:          toISO(form.starts_at),
        ends_at:            toISO(form.ends_at),
        max_capacity:       Number(form.max_capacity),
        cover_url:          form.media_urls[0],
        gallery_urls:       form.media_urls.slice(1),
        ...(form.safety_description.trim() && { safety_description: form.safety_description.trim() }),
        ...(form.expected_profile.trim()   && { expected_profile:   form.expected_profile.trim() }),
        ticket_types: form.ticket_types.map((t) => ({
          name:          t.name.trim(),
          price_fcfa:    Number(t.price_fcfa),
          quantity:      Number(t.quantity),
          max_per_order: Number(t.max_per_order) || 10,
          is_seated: t.is_seated,
          included_items: parseCommaList(t.included_items_raw),
          variant_options: parseCommaList(t.variant_options_raw),
          ...(t.description.trim() && { description: t.description.trim() }),
        })),
        merch_items: form.merch_items.map((m) => ({
          name:            m.name.trim(),
          price_fcfa:      Number(m.price_fcfa),
          quantity:        Number(m.quantity),
          variant_options: parseCommaList(m.variant_options_raw),
          ...(m.description.trim() && { description: m.description.trim() }),
        })),
      };

      const created = await apiClient.post<{ id: string }>("/events", payload);
      const submitBody = adEnabled && adMediaUrl
        ? { ad_media_url: adMediaUrl, ad_media_type: adMediaType, ad_days: adDays }
        : {};
      const result = await apiClient.patch<{
        status?: string;
        total_fcfa: number;
        payment_token?: string;
      }>(`/events/${created.id}/submit`, submitBody);

      if (result.total_fcfa === 0 || !result.payment_token) {
        router.push("/fournisseur/evenements?submitted=1");
        return;
      }

      // Paiement requis — widget CinetPay intégré (pas de redirection hors de l'app).
      setPayingMessage("Ouverture du paiement…");
      await openCinetPaySeamless(result.payment_token);
      setPayingMessage("Paiement en cours de confirmation…");
      await waitForEventPending(created.id);
      router.push("/fournisseur/evenements?submitted=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue.";
      setError(msg);
      setSubmitting(false);
      setPayingMessage(null);
    }
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  return (
    <div className="mobile-container min-h-screen bg-page pb-28">
      {/* Header */}
      <header className="bg-surface-card border-b border-border-subtle px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => (step > 1 ? setStep((s) => s - 1) : router.back())} className="text-ink-soft text-xl">‹</button>
          <div className="flex-1">
            <h1 className="text-base font-sora font-bold text-ink">Publier un événement</h1>
            <p className="text-xs text-ink-soft font-dm">
              {step === 1 ? "Infos de base" : step === 2 ? "Lieu & dates" : step === 3 ? "Photos" : "Types de billets"}
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5">
        <StepIndicator step={step} total={4} />

        {/* Erreur globale */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ======================================================
         * ÉTAPE 1 — Infos de base
         * ====================================================== */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Titre de l'événement" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Ex : FASO JAZZ FESTIVAL 2026"
                className={inputCls}
                maxLength={200}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie principale" required>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    category_id: e.target.value,
                    additional_category_ids: f.additional_category_ids.filter((id) => id !== e.target.value),
                  }))}
                  className={selectCls}
                >
                  <option value="">— Choisir —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Ville" required>
                <select value={form.city_id} onChange={(e) => set("city_id", e.target.value)} className={selectCls}>
                  <option value="">— Choisir —</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value={NEW_CITY_SENTINEL}>+ Ma ville n&apos;est pas listée</option>
                </select>
              </Field>
            </div>

            {form.city_id === NEW_CITY_SENTINEL && (
              <div className="grid grid-cols-2 gap-3 -mt-2">
                <Field label="Nom de la ville" required>
                  <input
                    type="text"
                    value={form.new_city_name}
                    onChange={(e) => set("new_city_name", e.target.value)}
                    placeholder="Ex : Léo"
                    className={selectCls}
                  />
                </Field>
                <Field label="Région" required>
                  <input
                    type="text"
                    value={form.new_city_region}
                    onChange={(e) => set("new_city_region", e.target.value)}
                    placeholder="Ex : Centre-Ouest"
                    className={selectCls}
                  />
                </Field>
                <p className="col-span-2 text-xs text-ink-soft -mt-1">
                  Votre ville sera ajoutée immédiatement — vous n&apos;avez pas besoin d&apos;attendre
                  une validation pour publier. On la localisera avec l&apos;adresse du lieu à l&apos;étape suivante.
                </p>
              </div>
            )}

            <Field label="Autres catégories (optionnel)">
              <p className="text-xs text-ink-soft mb-2 -mt-1">
                Aide les gens à trouver votre événement depuis plusieurs catégories — n&apos;affecte
                pas le badge affiché, qui suit toujours la catégorie principale. 5 max.
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.filter((c) => c.id !== form.category_id).map((c) => {
                  const selected = form.additional_category_ids.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        additional_category_ids: selected
                          ? f.additional_category_ids.filter((id) => id !== c.id)
                          : f.additional_category_ids.length < 5
                          ? [...f.additional_category_ids, c.id]
                          : f.additional_category_ids,
                      }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? "bg-green-700 text-white border-green-700"
                          : "bg-surface-card text-ink-soft border-border-subtle"
                      }`}
                    >
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Description" required>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Décrivez votre événement : programme, artistes, ambiance attendue… (min. 20 caractères)"
                className={inputCls + " resize-none h-36"}
                maxLength={10000}
              />
              <p className="text-xs text-ink-soft mt-1 text-right">{form.description.length} / 10 000</p>
            </Field>
          </div>
        )}

        {/* ======================================================
         * ÉTAPE 2 — Lieu & dates
         * ====================================================== */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="Nom du lieu" required>
              <input
                type="text"
                value={form.venue_name}
                onChange={(e) => set("venue_name", e.target.value)}
                placeholder="Ex : Stade du 4-Août, Jardin de Zogona"
                className={inputCls}
                maxLength={200}
              />
            </Field>

            <Field label="Adresse complète" required>
              <input
                type="text"
                value={form.venue_address}
                onChange={(e) => set("venue_address", e.target.value)}
                placeholder="Ex : Avenue Kwame Nkrumah, Secteur 4, Ouagadougou"
                className={inputCls}
                maxLength={500}
              />
            </Field>

            <Field label="Position exacte sur la carte" required>
              <p className="text-xs text-ink-soft mb-2 -mt-1">
                Obligatoire : c&apos;est ce qui permet à un inconnu qui n&apos;a jamais mis les
                pieds ici de trouver le lieu et d&apos;arriver le jour J. Sans position exacte,
                le bouton « Itinéraire » ne s&apos;affichera pas sur la page de l&apos;événement.
              </p>
              <LocationPicker
                initialQuery={form.venue_name || form.venue_address}
                value={form.latitude !== null && form.longitude !== null ? { latitude: form.latitude, longitude: form.longitude } : null}
                onChange={(pos) => setForm((f) => ({ ...f, latitude: pos.latitude, longitude: pos.longitude }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Début" required>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => set("starts_at", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Fin" required>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => set("ends_at", e.target.value)}
                  min={form.starts_at}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Capacité maximale" required>
              <input
                type="number"
                value={form.max_capacity}
                onChange={(e) => set("max_capacity", e.target.value)}
                placeholder="Ex : 500"
                min={1}
                max={100000}
                className={inputCls}
              />
            </Field>

            {/* Optionnel */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">Optionnel</p>

              <div className="space-y-4">
                <Field label="Mesures de sécurité">
                  <textarea
                    value={form.safety_description}
                    onChange={(e) => set("safety_description", e.target.value)}
                    placeholder="Dispositif sécuritaire, accès PMR, règles d'entrée…"
                    className={inputCls + " resize-none h-24"}
                    maxLength={5000}
                  />
                </Field>

                <Field label="Public attendu">
                  <input
                    type="text"
                    value={form.expected_profile}
                    onChange={(e) => set("expected_profile", e.target.value)}
                    placeholder="Ex : Tout public, 18+, familles…"
                    className={inputCls}
                    maxLength={500}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================
         * ÉTAPE 3 — Photos & affiches
         * ====================================================== */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft font-dm">
              Ajoutez au moins 3 photos de l&apos;événement (lieu, artistes, édition précédente…)
              ou votre affiche officielle. C&apos;est ce qui rassure vos futurs participants.
            </p>
            <MediaUploader
              urls={form.media_urls}
              onChange={(urls) => set("media_urls", urls)}
            />
          </div>
        )}

        {/* ======================================================
         * ÉTAPE 4 — Types de billets
         * ====================================================== */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft font-dm">
              Définissez les catégories de billets. Vous pouvez en ajouter plusieurs (VIP, Général, Presse…).
            </p>

            {form.ticket_types.map((ticket, idx) => (
              <div key={idx} className="bg-surface-card rounded-2xl border border-border-subtle p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-jakarta font-semibold text-ink text-sm">
                    Billet {idx + 1}
                  </p>
                  {form.ticket_types.length > 1 && (
                    <button
                      onClick={() => removeTicket(idx)}
                      className="text-xs text-red-500 font-dm"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                <Field label="Nom du billet" required>
                  <input
                    type="text"
                    value={ticket.name}
                    onChange={(e) => setTicket(idx, "name", e.target.value)}
                    placeholder="Ex : Entrée générale, VIP, Early bird"
                    className={inputCls}
                    maxLength={100}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prix (FCFA)" required>
                    <input
                      type="number"
                      value={ticket.price_fcfa}
                      onChange={(e) => setTicket(idx, "price_fcfa", e.target.value)}
                      placeholder="0 = gratuit"
                      min={0}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Quantité" required>
                    <input
                      type="number"
                      value={ticket.quantity}
                      onChange={(e) => setTicket(idx, "quantity", e.target.value)}
                      placeholder="Ex : 200"
                      min={1}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Max par commande">
                  <input
                    type="number"
                    value={ticket.max_per_order}
                    onChange={(e) => setTicket(idx, "max_per_order", e.target.value)}
                    min={1}
                    max={100}
                    className={inputCls}
                  />
                </Field>

                <div>
                  <p className="text-sm font-semibold text-ink-soft mb-1.5">Type de placement</p>
                  <p className="text-xs text-ink-soft mb-2">
                    Un même événement peut mélanger les deux : par exemple une tribune en admission générale et une rangée VIP à places numérotées, chacune comme son propre type de billet.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTicket(idx, "is_seated", false)}
                      className={[
                        "text-left p-3 rounded-xl border-2 transition-colors",
                        !ticket.is_seated ? "border-green-600 bg-green-50 dark:bg-green-950/30" : "border-border-subtle",
                      ].join(" ")}
                    >
                      <p className="text-sm font-semibold text-ink">Admission générale</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        Aucune place assignée — chacun s&apos;installe où il veut parmi les places libres.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicket(idx, "is_seated", true)}
                      className={[
                        "text-left p-3 rounded-xl border-2 transition-colors",
                        ticket.is_seated ? "border-green-600 bg-green-50 dark:bg-green-950/30" : "border-border-subtle",
                      ].join(" ")}
                    >
                      <p className="text-sm font-semibold text-ink">Places numérotées</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        Chaque billet reçoit un numéro de place automatique (ex : « {ticket.name || "Rangée VIP"} · Place 1 », puis 2, 3…). Le nom ci-dessus fait déjà office de section ou de rangée.
                      </p>
                    </button>
                  </div>
                </div>

                <Field label="Description du billet">
                  <input
                    type="text"
                    value={ticket.description}
                    onChange={(e) => setTicket(idx, "description", e.target.value)}
                    placeholder="Ex : Accès zone VIP + buffet"
                    className={inputCls}
                    maxLength={500}
                  />
                </Field>

                <Field label="Inclus dans ce billet (optionnel)">
                  <input
                    type="text"
                    value={ticket.included_items_raw}
                    onChange={(e) => setTicket(idx, "included_items_raw", e.target.value)}
                    placeholder="Ex : 1 T-shirt VIVRE, Cocktail offert"
                    className={inputCls}
                  />
                  <p className="text-xs text-ink-soft mt-1">
                    Séparez par des virgules. Déjà compris dans le prix — pas d&apos;achat séparé.
                  </p>
                </Field>

                <Field label="Options à choisir, ex. taille (optionnel)">
                  <input
                    type="text"
                    value={ticket.variant_options_raw}
                    onChange={(e) => setTicket(idx, "variant_options_raw", e.target.value)}
                    placeholder="Ex : S, M, L, XL"
                    className={inputCls}
                  />
                  <p className="text-xs text-ink-soft mt-1">
                    Si rempli, l&apos;acheteur devra choisir une option avant de réserver.
                  </p>
                </Field>
              </div>
            ))}

            <button
              onClick={addTicket}
              className="w-full border-2 border-dashed border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 font-jakarta font-semibold py-3 rounded-2xl text-sm hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
            >
              + Ajouter un type de billet
            </button>

            {/* Produits en option (merch) */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1">Optionnel</p>
              <p className="text-sm text-ink-soft font-dm mb-3">
                Produits que l&apos;acheteur peut ajouter à sa commande, séparément du billet
                (ex : tote bag, poster). Achat en plus — pas inclus dans un billet.
              </p>

              {form.merch_items.map((merch, idx) => (
                <div key={idx} className="bg-surface-card rounded-2xl border border-border-subtle p-4 space-y-3 mb-3">
                  <div className="flex items-center justify-between">
                    <p className="font-jakarta font-semibold text-ink text-sm">
                      Produit {idx + 1}
                    </p>
                    <button
                      onClick={() => removeMerch(idx)}
                      className="text-xs text-red-500 font-dm"
                    >
                      Supprimer
                    </button>
                  </div>

                  <Field label="Nom du produit" required>
                    <input
                      type="text"
                      value={merch.name}
                      onChange={(e) => setMerch(idx, "name", e.target.value)}
                      placeholder="Ex : Tote bag VIVRE"
                      className={inputCls}
                      maxLength={60}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Prix (FCFA)" required>
                      <input
                        type="number"
                        value={merch.price_fcfa}
                        onChange={(e) => setMerch(idx, "price_fcfa", e.target.value)}
                        min={0}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Stock" required>
                      <input
                        type="number"
                        value={merch.quantity}
                        onChange={(e) => setMerch(idx, "quantity", e.target.value)}
                        placeholder="Ex : 100"
                        min={1}
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <Field label="Description">
                    <input
                      type="text"
                      value={merch.description}
                      onChange={(e) => setMerch(idx, "description", e.target.value)}
                      placeholder="Ex : Coton bio, taille unique"
                      className={inputCls}
                      maxLength={200}
                    />
                  </Field>

                  <Field label="Options à choisir, ex. taille (optionnel)">
                    <input
                      type="text"
                      value={merch.variant_options_raw}
                      onChange={(e) => setMerch(idx, "variant_options_raw", e.target.value)}
                      placeholder="Ex : S, M, L, XL"
                      className={inputCls}
                    />
                  </Field>
                </div>
              ))}

              <button
                onClick={addMerch}
                className="w-full border-2 border-dashed border-border-subtle text-ink-soft font-jakarta font-semibold py-3 rounded-2xl text-sm hover:bg-surface-elevated transition-colors"
              >
                + Ajouter un produit
              </button>
            </div>

            {/* Publicité optionnelle */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="font-jakarta font-bold text-sm text-ink">
                    Ajouter une publicité (optionnel)
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Photo ou vidéo mise en avant sur l&apos;accueil, dès l&apos;approbation de votre événement.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={adEnabled}
                  onChange={(e) => setAdEnabled(e.target.checked)}
                  className="w-5 h-5 accent-green-700 shrink-0"
                />
              </label>

              {adEnabled && (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    {(["image", "video"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAdMediaType(t)}
                        className={[
                          "flex-1 py-2 rounded-lg text-sm font-semibold border",
                          adMediaType === t
                            ? "bg-green-700 text-white border-green-700"
                            : "bg-surface-card text-ink-soft border-border-subtle",
                        ].join(" ")}
                      >
                        {t === "image" ? "Photo" : "Vidéo"}
                      </button>
                    ))}
                  </div>

                  <input
                    type="file"
                    accept={adMediaType === "video" ? "video/*" : "image/*"}
                    onChange={(e) => void handleAdUpload(e.target.files?.[0])}
                    disabled={adUploading}
                    className="text-sm"
                  />
                  {adUploading && <p className="text-xs text-ink-soft">Envoi…</p>}
                  {adMediaUrl && (
                    <p className="text-xs text-green-700 dark:text-green-300">✓ Fichier envoyé</p>
                  )}

                  <Field label="Nombre de jours">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={adDays}
                      onChange={(e) => setAdDays(Math.max(1, Number(e.target.value)))}
                      className={inputCls}
                    />
                  </Field>

                  {pricing && (
                    <p className="text-xs text-ink-soft">
                      {adFeePerDay.toLocaleString("fr-FR")} FCFA/jour × {adDays} jour{adDays > 1 ? "s" : ""} ={" "}
                      <strong>{adTotal.toLocaleString("fr-FR")} FCFA</strong>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Récapitulatif */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-dm">
              <p className="font-semibold mb-1">Avant publication</p>
              <p>
                {pricing?.free_period_enabled
                  ? "Période de lancement gratuite — aucun frais à payer pour le moment."
                  : `Frais de mise en ligne : ${(pricing?.listing_fee_fcfa ?? 0).toLocaleString("fr-FR")} FCFA${adEnabled ? ` + ${adTotal.toLocaleString("fr-FR")} FCFA de publicité = ${grandTotal.toLocaleString("fr-FR")} FCFA au total` : ""}, réglés par mobile money à l'étape suivante.`}
              </p>
              <p className="mt-1.5">
                {form.ticket_types.every((t) => Number(t.price_fcfa) === 0)
                  ? "Une fois payé, votre événement passe en attente d'approbation."
                  : "Au moins un billet payant → votre compte organisateur doit être vérifié (pièce d'identité + appel de confirmation) en plus du paiement, avant examen par notre équipe."}
              </p>
            </div>
          </div>
        )}
      </div>

      {payingMessage && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-surface-card rounded-2xl px-6 py-8 text-center max-w-xs">
            <div className="w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-semibold text-ink">{payingMessage}</p>
          </div>
        </div>
      )}

      {/* Bouton bas de page */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe-bottom pt-3 bg-surface-card border-t border-border-subtle z-20">
        <div className="mobile-container">
          {step < 4 ? (
            <button
              onClick={nextStep}
              className="w-full bg-green-700 text-white font-jakarta font-bold py-4 rounded-2xl text-base active:scale-95 transition-all"
            >
              Continuer →
            </button>
          ) : (
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="w-full bg-green-700 text-white font-jakarta font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-all"
            >
              {submitting ? "Publication en cours…" : "Soumettre pour approbation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
