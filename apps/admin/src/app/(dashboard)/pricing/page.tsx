"use client";

/**
 * (dashboard)/pricing/page.tsx — Gestion des tarifs intraurbains par ville
 *
 * Deux niveaux de configuration par ville :
 *   1. Tarifs de base — taxi/zémidjan (FCFA/km), tarif minimum, multiplicateur nuit
 *   2. Règles tarifaires — surcharges temporelles (mois, jours, heures, fenêtre calendaire)
 *      Les règles actives se multiplient entre elles (effet cumulatif, plafonné à 2×).
 *
 * Exemples de règles :
 *   "FESPACO 2026"      → Mois: Fév · ×1.30 taxi + ×1.20 zémidjan
 *   "Rush du soir"      → Heures: 17h–20h · tous les jours · ×1.15
 *   "Saison des pluies" → Mois: Juin–Sep · ×1.10
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City {
  id:                    string;
  name:                  string;
  region:                string;
  taxi_rate_per_km:      number;
  zemidjan_rate_per_km:  number;
  min_fare:              number;
  night_rate_multiplier: number;
  has_drivers:           boolean;
  updated_at:            string;
}

interface PricingRule {
  id:                  string;
  city_id:             string;
  label:               string;
  months:              number[];
  weekdays:            number[];
  hour_start:          number | null;
  hour_end:            number | null;
  date_from:           string | null;
  date_to:             string | null;
  taxi_multiplier:     number;
  zemidjan_multiplier: number;
  priority:            number;
  is_active:           boolean;
  created_at:          string;
  updated_at:          string;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const DAY_LABELS   = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/* ============================================================
 * HELPERS
 * ============================================================ */

function conditionSummary(rule: PricingRule): string {
  const parts: string[] = [];

  if (rule.months.length > 0 && rule.months.length < 12) {
    parts.push(rule.months.map((m) => MONTH_LABELS[m - 1]).join(", "));
  }
  if (rule.weekdays.length > 0 && rule.weekdays.length < 7) {
    parts.push(rule.weekdays.map((d) => DAY_LABELS[d]).join(", "));
  }
  if (rule.hour_start !== null && rule.hour_end !== null) {
    parts.push(`${rule.hour_start}h–${rule.hour_end}h`);
  }
  if (rule.date_from ?? rule.date_to) {
    const from = rule.date_from ? new Date(rule.date_from).toLocaleDateString("fr-FR") : "…";
    const to   = rule.date_to   ? new Date(rule.date_to).toLocaleDateString("fr-FR")   : "…";
    parts.push(`${from} → ${to}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Toujours";
}

function multBadge(v: number) {
  const pct = Math.round((v - 1) * 100);
  if (v === 1) return <span className="text-gray-400 text-xs">×1.00</span>;
  return (
    <span className={`text-xs font-semibold ${pct > 0 ? "text-orange-600" : "text-green-600"}`}>
      ×{v.toFixed(2)} ({pct > 0 ? "+" : ""}{pct}%)
    </span>
  );
}

/* ============================================================
 * FORMULAIRE DE RÈGLE — modale
 * ============================================================ */

const EMPTY_RULE = {
  label:               "",
  months:              [] as number[],
  weekdays:            [] as number[],
  hour_start:          null as number | null,
  hour_end:            null as number | null,
  date_from:           "",
  date_to:             "",
  taxi_multiplier:     1.0,
  zemidjan_multiplier: 1.0,
  priority:            0,
  is_active:           true,
};
type RuleForm = typeof EMPTY_RULE;

function RuleModal({
  cityId, rule, onClose, onSaved,
}: {
  cityId: string;
  rule:   PricingRule | null; /* null = création */
  onClose: () => void;
  onSaved: (r: PricingRule) => void;
}) {
  const [form, setForm] = useState<RuleForm>(() =>
    rule
      ? {
          label:               rule.label,
          months:              rule.months,
          weekdays:            rule.weekdays,
          hour_start:          rule.hour_start,
          hour_end:            rule.hour_end,
          date_from:           rule.date_from ? rule.date_from.slice(0, 10) : "",
          date_to:             rule.date_to   ? rule.date_to.slice(0, 10)   : "",
          taxi_multiplier:     rule.taxi_multiplier,
          zemidjan_multiplier: rule.zemidjan_multiplier,
          priority:            rule.priority,
          is_active:           rule.is_active,
        }
      : { ...EMPTY_RULE }
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  function toggleArr<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  async function handleSave() {
    if (!form.label.trim()) { setError("Le libellé est requis."); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        date_from: form.date_from ? new Date(form.date_from).toISOString() : null,
        date_to:   form.date_to   ? new Date(form.date_to).toISOString()   : null,
        ...(form.hour_start === null || form.hour_end === null
          ? { hour_start: null, hour_end: null }
          : {}),
      };

      const saved = rule
        ? await apiClient.patch<PricingRule>(`/admin/rules/${rule.id}`, body)
        : await apiClient.post<PricingRule>(`/admin/cities/${cityId}/rules`, body);

      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {rule ? "Modifier la règle" : "Nouvelle règle tarifaire"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Libellé */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Libellé *
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="ex: FESPACO 2026, Saison des pluies, Rush du soir…"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Mois */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Mois concernés <span className="font-normal normal-case text-gray-400">(vide = tous)</span>
            </label>
            <div className="grid grid-cols-6 gap-2">
              {MONTH_LABELS.map((m, i) => {
                const val = i + 1;
                const on  = form.months.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, months: toggleArr(f.months, val) }))}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      on ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jours */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Jours de la semaine <span className="font-normal normal-case text-gray-400">(vide = tous)</span>
            </label>
            <div className="flex gap-2">
              {DAY_LABELS.map((d, i) => {
                const on = form.weekdays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, weekdays: toggleArr(f.weekdays, i) }))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      on ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Heures */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Plage horaire <span className="font-normal normal-case text-gray-400">(laisser vide = toute la journée)</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">De</span>
                <input
                  type="number" min={0} max={23}
                  value={form.hour_start ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, hour_start: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="0"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-sm text-gray-500">h</span>
              </div>
              <span className="text-gray-400">→</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">À</span>
                <input
                  type="number" min={0} max={23}
                  value={form.hour_end ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, hour_end: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="23"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-sm text-gray-500">h inclus</span>
              </div>
              <span className="text-xs text-gray-400">(ex: 22→6 = chevauchement minuit)</span>
            </div>
          </div>

          {/* Fenêtre calendaire */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Fenêtre calendaire <span className="font-normal normal-case text-gray-400">(optionnel — pour un événement précis)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={form.date_from}
                onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                value={form.date_to}
                onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Multiplicateurs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Multiplicateur Taxi
              </label>
              <input
                type="number" min={0.5} max={2.0} step={0.05}
                value={form.taxi_multiplier}
                onChange={(e) => setForm((f) => ({ ...f, taxi_multiplier: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.taxi_multiplier === 1 ? "Pas de surcharge" : `+${Math.round((form.taxi_multiplier - 1) * 100)}%`}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Multiplicateur Zémidjan
              </label>
              <input
                type="number" min={0.5} max={2.0} step={0.05}
                value={form.zemidjan_multiplier}
                onChange={(e) => setForm((f) => ({ ...f, zemidjan_multiplier: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.zemidjan_multiplier === 1 ? "Pas de surcharge" : `+${Math.round((form.zemidjan_multiplier - 1) * 100)}%`}
              </p>
            </div>
          </div>

          {/* Priorité + Actif */}
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Priorité</label>
              <input
                type="number" min={0} max={100}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="w-20 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? "bg-orange-500" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-gray-700">{form.is_active ? "Règle active" : "Désactivée"}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : rule ? "Modifier" : "Créer la règle"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function PricingPage() {
  const [cities,         setCities]         = useState<City[]>([]);
  const [selectedCity,   setSelectedCity]   = useState<City | null>(null);
  const [rules,          setRules]          = useState<PricingRule[]>([]);
  const [loadingCities,  setLoadingCities]  = useState(true);
  const [loadingRules,   setLoadingRules]   = useState(false);
  const [showModal,      setShowModal]      = useState(false);
  const [editingRule,    setEditingRule]    = useState<PricingRule | null>(null);
  const [editingRates,   setEditingRates]   = useState(false);
  const [ratesForm,      setRatesForm]      = useState<Partial<City>>({});
  const [savingRates,    setSavingRates]    = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  /* Charger toutes les villes avec leurs tarifs */
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<{ cities: City[] }>("/admin/cities/rates");
        setCities(res.cities);
        if (res.cities.length > 0 && !selectedCity) {
          setSelectedCity(res.cities[0] ?? null);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Impossible de charger les villes");
      } finally {
        setLoadingCities(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Charger les règles de la ville sélectionnée */
  const loadRules = useCallback(async (cityId: string) => {
    setLoadingRules(true);
    try {
      const res = await apiClient.get<{ rules: PricingRule[] }>(`/admin/cities/${cityId}/rules`);
      setRules(res.rules);
    } catch {
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCity) void loadRules(selectedCity.id);
  }, [selectedCity, loadRules]);

  /* Sauvegarder les tarifs de base */
  async function saveRates() {
    if (!selectedCity) return;
    setSavingRates(true);
    try {
      const updated = await apiClient.patch<City>(`/admin/cities/${selectedCity.id}/rates`, ratesForm);
      setSelectedCity(updated);
      setCities((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
      setEditingRates(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSavingRates(false);
    }
  }

  /* Supprimer une règle */
  async function deleteRule(ruleId: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    try {
      await apiClient.delete(`/admin/rules/${ruleId}`);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la suppression");
    }
  }

  /* Basculer is_active d'une règle */
  async function toggleRule(rule: PricingRule) {
    try {
      const updated = await apiClient.patch<PricingRule>(`/admin/rules/${rule.id}`, { is_active: !rule.is_active });
      setRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    }
  }

  function handleRuleSaved(saved: PricingRule) {
    setRules((prev) => {
      const exists = prev.find((r) => r.id === saved.id);
      return exists ? prev.map((r) => r.id === saved.id ? saved : r) : [saved, ...prev];
    });
    setShowModal(false);
    setEditingRule(null);
  }

  function openCreateModal() { setEditingRule(null); setShowModal(true); }
  function openEditModal(r: PricingRule) { setEditingRule(r); setShowModal(true); }

  return (
    <div className="flex h-full gap-6 max-w-7xl">
      {/* ===== COLONNE GAUCHE — liste des villes ===== */}
      <aside className="w-64 flex-shrink-0">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm">Villes</h2>
            <p className="text-xs text-gray-400 mt-0.5">{cities.length} ville{cities.length !== 1 ? "s" : ""}</p>
          </div>
          {loadingCities ? (
            <div className="p-4 text-center text-sm text-gray-400">Chargement…</div>
          ) : (
            <nav className="py-2">
              {cities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => { setSelectedCity(city); setEditingRates(false); }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    selectedCity?.id === city.id
                      ? "bg-orange-50 text-orange-700 font-semibold border-r-2 border-orange-500"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium">{city.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{city.region}</div>
                  {!city.has_drivers && (
                    <span className="text-xs text-gray-300 italic">Courses inactives</span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      </aside>

      {/* ===== COLONNE DROITE — tarifs + règles ===== */}
      <div className="flex-1 space-y-6 min-w-0">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex justify-between items-center">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {!selectedCity ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
            Sélectionnez une ville pour gérer ses tarifs.
          </div>
        ) : (
          <>
            {/* --- TARIFS DE BASE --- */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedCity.name} — Tarifs de base</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Modifié le {new Date(selectedCity.updated_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                {!editingRates ? (
                  <button
                    onClick={() => { setEditingRates(true); setRatesForm({ taxi_rate_per_km: selectedCity.taxi_rate_per_km, zemidjan_rate_per_km: selectedCity.zemidjan_rate_per_km, min_fare: selectedCity.min_fare, night_rate_multiplier: selectedCity.night_rate_multiplier }); }}
                    className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-50 transition-colors"
                  >
                    ✏️ Modifier
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingRates(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Annuler</button>
                    <button onClick={() => void saveRates()} disabled={savingRates} className="px-4 py-2 text-sm font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-60">
                      {savingRates ? "Sauvegarde…" : "Sauvegarder"}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { key: "taxi_rate_per_km",      label: "Taxi (FCFA/km)",       suffix: "FCFA/km", current: selectedCity.taxi_rate_per_km,      isFloat: false },
                  { key: "zemidjan_rate_per_km",   label: "Zémidjan (FCFA/km)",   suffix: "FCFA/km", current: selectedCity.zemidjan_rate_per_km,   isFloat: false },
                  { key: "min_fare",               label: "Tarif minimum",        suffix: "FCFA",    current: selectedCity.min_fare,               isFloat: false },
                  { key: "night_rate_multiplier",  label: "Surcharge nuit (22h–6h)", suffix: "×",   current: selectedCity.night_rate_multiplier,  isFloat: true  },
                ].map(({ key, label, suffix, current, isFloat }) => (
                  <div key={key} className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    {editingRates ? (
                      <input
                        type="number"
                        step={isFloat ? 0.05 : 10}
                        min={isFloat ? 1.0 : 50}
                        max={isFloat ? 1.5 : 10000}
                        value={(ratesForm as Record<string, number>)[key] ?? current}
                        onChange={(e) => setRatesForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                        className="w-full bg-white border border-orange-300 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    ) : (
                      <p className="text-xl font-bold text-gray-900">
                        {isFloat ? current.toFixed(2) : current.toLocaleString()}
                        <span className="text-xs font-normal text-gray-400 ml-1">{suffix}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* --- RÈGLES TARIFAIRES --- */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Règles tarifaires</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Les règles actives s&apos;empilent (effet cumulatif, plafonné à ×2.00).
                  </p>
                </div>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors"
                >
                  <span>+</span> Nouvelle règle
                </button>
              </div>

              {loadingRules ? (
                <div className="p-8 text-center text-sm text-gray-400">Chargement des règles…</div>
              ) : rules.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-400 text-sm mb-3">Aucune règle — les tarifs de base s&apos;appliquent en permanence.</p>
                  <button onClick={openCreateModal} className="text-orange-500 text-sm font-semibold hover:underline">
                    + Créer la première règle
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Libellé</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conditions</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxi</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Zémidjan</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rules.map((rule) => (
                      <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${!rule.is_active ? "opacity-50" : ""}`}>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{rule.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Priorité {rule.priority}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600">{conditionSummary(rule)}</td>
                        <td className="px-4 py-4 text-center">{multBadge(rule.taxi_multiplier)}</td>
                        <td className="px-4 py-4 text-center">{multBadge(rule.zemidjan_multiplier)}</td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => void toggleRule(rule)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${rule.is_active ? "bg-orange-500" : "bg-gray-300"}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEditModal(rule)}
                              className="text-xs text-gray-500 hover:text-orange-600 font-medium transition-colors"
                            >
                              Modifier
                            </button>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={() => void deleteRule(rule.id)}
                              className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modale création / édition */}
      {showModal && selectedCity && (
        <RuleModal
          cityId={selectedCity.id}
          rule={editingRule}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
          onSaved={handleRuleSaved}
        />
      )}
    </div>
  );
}
