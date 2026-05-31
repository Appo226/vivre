"use client";

/**
 * /evenements/publier — Formulaire de création d'événement (organisateurs)
 *
 * Flux :
 *   1. POST /events         → crée en "draft", retourne event.id
 *   2. PATCH /events/:id/submit → soumet pour approbation (→ pending_approval)
 *   3. Redirection → /fournisseur/evenements
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City     { id: string; name: string }
interface Category { id: string; name: string; icon: string }

interface TicketDraft {
  name:          string;
  price_fcfa:    string;
  quantity:      string;
  max_per_order: string;
  description:   string;
}

interface FormState {
  title:              string;
  category_id:        string;
  city_id:            string;
  description:        string;
  venue_name:         string;
  venue_address:      string;
  starts_at:          string; /* valeur d'un <input type="datetime-local"> */
  ends_at:            string;
  max_capacity:       string;
  safety_description: string;
  expected_profile:   string;
  ticket_types:       TicketDraft[];
}

const BLANK_TICKET: TicketDraft = {
  name: "", price_fcfa: "", quantity: "", max_per_order: "10", description: "",
};

const INITIAL_FORM: FormState = {
  title: "", category_id: "", city_id: "", description: "",
  venue_name: "", venue_address: "",
  starts_at: "", ends_at: "", max_capacity: "",
  safety_description: "", expected_profile: "",
  ticket_types: [{ ...BLANK_TICKET }],
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
            : i + 1 < step  ? "bg-green-200 text-green-800"
            : "bg-gray-200 text-gray-500",
          ].join(" ")}>
            {i + 1 < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div className={["flex-1 h-0.5 max-w-10", i + 1 < step ? "bg-green-300" : "bg-gray-200"].join(" ")} />
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
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white";
const selectCls = inputCls + " appearance-none";

/* ============================================================
 * PAGE
 * ============================================================ */

export default function PublierEvenementPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [step,       setStep]       = useState(1);
  const [form,       setForm]       = useState<FormState>(INITIAL_FORM);
  const [cities,     setCities]     = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    void Promise.all([
      apiClient.get<{ cities: City[] }>("/cities"),
      apiClient.get<{ categories: Category[] }>("/events/categories"),
    ]).then(([c, cat]) => {
      setCities(c.cities);
      setCategories(cat.categories);
    }).catch(() => {});
  }, [accessToken, router]);

  /* ---- helpers de mise à jour ---- */

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setTicket(idx: number, key: keyof TicketDraft, value: string) {
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

  /* ---- validation par étape ---- */

  function validateStep1(): string | null {
    if (!form.title.trim() || form.title.trim().length < 3)
      return "Le titre doit faire au moins 3 caractères.";
    if (!form.category_id) return "Sélectionnez une catégorie.";
    if (!form.city_id)     return "Sélectionnez une ville.";
    if (!form.description.trim() || form.description.trim().length < 20)
      return "La description doit faire au moins 20 caractères.";
    return null;
  }

  function validateStep2(): string | null {
    if (!form.venue_name.trim()) return "Saisissez le nom du lieu.";
    if (!form.venue_address.trim() || form.venue_address.trim().length < 5)
      return "Saisissez l'adresse complète du lieu.";
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
    for (let i = 0; i < form.ticket_types.length; i++) {
      const t = form.ticket_types[i]!;
      if (!t.name.trim()) return `Billet ${i + 1} : saisissez un nom.`;
      if (t.price_fcfa === "" || Number(t.price_fcfa) < 0)
        return `Billet ${i + 1} : prix invalide (0 = gratuit).`;
      if (!t.quantity || Number(t.quantity) < 1)
        return `Billet ${i + 1} : quantité doit être au moins 1.`;
    }
    return null;
  }

  function nextStep() {
    setError(null);
    const err = step === 1 ? validateStep1() : validateStep2();
    if (err) { setError(err); return; }
    setStep((s) => s + 1);
  }

  /* ---- soumission finale ---- */

  async function handleSubmit(): Promise<void> {
    setError(null);
    const err = validateStep3();
    if (err) { setError(err); return; }

    setSubmitting(true);
    try {
      const payload = {
        title:              form.title.trim(),
        category_id:        form.category_id,
        city_id:            form.city_id,
        description:        form.description.trim(),
        venue_name:         form.venue_name.trim(),
        venue_address:      form.venue_address.trim(),
        starts_at:          toISO(form.starts_at),
        ends_at:            toISO(form.ends_at),
        max_capacity:       Number(form.max_capacity),
        ...(form.safety_description.trim() && { safety_description: form.safety_description.trim() }),
        ...(form.expected_profile.trim()   && { expected_profile:   form.expected_profile.trim() }),
        ticket_types: form.ticket_types.map((t) => ({
          name:          t.name.trim(),
          price_fcfa:    Number(t.price_fcfa),
          quantity:      Number(t.quantity),
          max_per_order: Number(t.max_per_order) || 10,
          ...(t.description.trim() && { description: t.description.trim() }),
        })),
      };

      const created = await apiClient.post<{ id: string }>("/events", payload);
      await apiClient.patch(`/events/${created.id}/submit`, {});
      router.push("/fournisseur/evenements?submitted=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue.";
      setError(msg);
      setSubmitting(false);
    }
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => (step > 1 ? setStep((s) => s - 1) : router.back())} className="text-gray-500 text-xl">‹</button>
          <div className="flex-1">
            <h1 className="text-base font-sora font-bold text-gray-900">Publier un événement</h1>
            <p className="text-xs text-gray-500 font-dm">
              {step === 1 ? "Infos de base" : step === 2 ? "Lieu & dates" : "Types de billets"}
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5">
        <StepIndicator step={step} total={3} />

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
              <Field label="Catégorie" required>
                <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)} className={selectCls}>
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
                </select>
              </Field>
            </div>

            <Field label="Description" required>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Décrivez votre événement : programme, artistes, ambiance attendue… (min. 20 caractères)"
                className={inputCls + " resize-none h-36"}
                maxLength={10000}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length} / 10 000</p>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Optionnel</p>

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
         * ÉTAPE 3 — Types de billets
         * ====================================================== */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 font-dm">
              Définissez les catégories de billets. Vous pouvez en ajouter plusieurs (VIP, Général, Presse…).
            </p>

            {form.ticket_types.map((ticket, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-jakarta font-semibold text-gray-800 text-sm">
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
              </div>
            ))}

            <button
              onClick={addTicket}
              className="w-full border-2 border-dashed border-green-300 text-green-700 font-jakarta font-semibold py-3 rounded-2xl text-sm hover:bg-green-50 transition-colors"
            >
              + Ajouter un type de billet
            </button>

            {/* Récapitulatif */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-dm">
              <p className="font-semibold mb-1">Avant publication</p>
              <p>Votre événement sera soumis à notre équipe pour validation sous 48h. Vous serez notifié par SMS dès l'approbation.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bouton bas de page */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-safe-bottom pt-3 bg-white border-t border-gray-100 z-20">
        <div className="mobile-container">
          {step < 3 ? (
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
