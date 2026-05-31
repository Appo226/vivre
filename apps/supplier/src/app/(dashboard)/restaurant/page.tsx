"use client";

/**
 * restaurant/page.tsx — Paramètres du restaurant
 *
 * Le fournisseur peut modifier :
 *   - Informations de base (nom, téléphone, description)
 *   - Options de service (livraison / à emporter, commande minimum)
 *   - Horaires d'ouverture par jour de la semaine
 *
 * Les changements sont sauvegardés via PATCH /restaurants/:id.
 * Les horaires sont au format "HH:MM-HH:MM" par jour.
 * Un toggle "Fermé" met l'horaire à null / chaîne vide.
 */

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface RestaurantInfo {
  id:                string;
  name:              string;
  phone:             string;
  description:       string | null;
  address:           string;
  offers_delivery:   boolean;
  offers_pickup:     boolean;
  min_order_fcfa:    number;
  avg_prep_minutes:  number;
  delivery_radius_km: number;
  opening_hours:     Record<string, string>;
  is_approved:       boolean;
  is_active:         boolean;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
];

/* ============================================================
 * COMPOSANT HORAIRE PAR JOUR
 * ============================================================ */

function DayHours({
  day,
  value,
  onChange,
}: {
  day:      { key: string; label: string };
  value:    string;
  onChange: (key: string, value: string) => void;
}) {
  const isOpen    = !!value;
  const [open, close] = value ? value.split("-") : ["08:00", "22:00"];

  function toggleClosed() {
    onChange(day.key, isOpen ? "" : "08:00-22:00");
  }

  function handleTime(part: "open" | "close", time: string) {
    const newOpen  = part === "open"  ? time : (open ?? "08:00");
    const newClose = part === "close" ? time : (close ?? "22:00");
    onChange(day.key, `${newOpen}-${newClose}`);
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="w-24 text-sm text-gray-700 font-medium">{day.label}</span>

      <button
        type="button"
        onClick={toggleClosed}
        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
          isOpen
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        {isOpen ? "Ouvert" : "Fermé"}
      </button>

      {isOpen && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={open ?? "08:00"}
            onChange={(e) => handleTime("open", e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
          />
          <span className="text-gray-400 text-xs">–</span>
          <input
            type="time"
            value={close ?? "22:00"}
            onChange={(e) => handleTime("close", e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function RestaurantSettingsPage() {
  const { user, accessToken } = useAuthStore();
  const restaurantId = user?.restaurantId;

  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  /* Formulaire local — copie des valeurs pour l'édition */
  const [form, setForm] = useState({
    name:               "",
    phone:              "",
    description:        "",
    offers_delivery:    true,
    offers_pickup:      true,
    min_order_fcfa:     0,
    avg_prep_minutes:   30,
    delivery_radius_km: 5,
    opening_hours:      {} as Record<string, string>,
  });

  /* --------------------------------------------------------
   * Charger les infos du restaurant
   * -------------------------------------------------------- */
  useEffect(() => {
    if (!accessToken || !restaurantId) { setLoading(false); return; }

    void (async () => {
      try {
        /* GET /restaurants/mine pour récupérer le restaurantId,
           puis GET /restaurants/:id pour les détails complets */
        const res = await apiClient.get<RestaurantInfo>(`/restaurants/${restaurantId}`);
        setRestaurant(res);
        setForm({
          name:               res.name,
          phone:              res.phone,
          description:        res.description ?? "",
          offers_delivery:    res.offers_delivery,
          offers_pickup:      res.offers_pickup,
          min_order_fcfa:     res.min_order_fcfa,
          avg_prep_minutes:   res.avg_prep_minutes,
          delivery_radius_km: res.delivery_radius_km,
          opening_hours:      res.opening_hours ?? {},
        });
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken, restaurantId]);

  /* --------------------------------------------------------
   * Sauvegarder les modifications
   * -------------------------------------------------------- */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/restaurants/${restaurantId}`, {
        name:               form.name,
        phone:              form.phone,
        ...(form.description ? { description: form.description } : {}),
        offers_delivery:    form.offers_delivery,
        offers_pickup:      form.offers_pickup,
        min_order_fcfa:     form.min_order_fcfa,
        avg_prep_minutes:   form.avg_prep_minutes,
        delivery_radius_km: form.delivery_radius_km,
        opening_hours:      form.opening_hours,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function setHours(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      opening_hours: { ...prev.opening_hours, [key]: value },
    }));
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-lg w-48" />
        <div className="h-64 bg-white rounded-xl border border-gray-100" />
        <div className="h-64 bg-white rounded-xl border border-gray-100" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres du restaurant</h1>
        {restaurant && !restaurant.is_approved && (
          <p className="mt-1 text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-1.5">
            ⏳ Votre restaurant est en attente d'approbation par l'équipe VIVRE.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          ✅ Modifications enregistrées avec succès.
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">

        {/* ── Informations générales ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Informations générales</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom du restaurant</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Décrivez votre restaurant, votre cuisine…"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none"
              />
            </div>
          </div>
        </section>

        {/* ── Options de service ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Options de service</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.offers_delivery}
                  onChange={(e) => setForm((p) => ({ ...p, offers_delivery: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-sm text-gray-700">🛵 Livraison à domicile</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.offers_pickup}
                  onChange={(e) => setForm((p) => ({ ...p, offers_pickup: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-sm text-gray-700">🏃 À emporter</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Commande min. (FCFA)
                </label>
                <input
                  type="number"
                  value={form.min_order_fcfa}
                  onChange={(e) => setForm((p) => ({ ...p, min_order_fcfa: parseInt(e.target.value) || 0 }))}
                  min="0"
                  step="500"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Préparation moy. (min)
                </label>
                <input
                  type="number"
                  value={form.avg_prep_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, avg_prep_minutes: parseInt(e.target.value) || 15 }))}
                  min="5"
                  max="120"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Rayon livraison (km)
                </label>
                <input
                  type="number"
                  value={form.delivery_radius_km}
                  onChange={(e) => setForm((p) => ({ ...p, delivery_radius_km: parseFloat(e.target.value) || 3 }))}
                  min="1"
                  max="30"
                  step="0.5"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Horaires d'ouverture ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Horaires d'ouverture</p>
          </div>
          <div className="px-5 py-2">
            {DAYS.map((day) => (
              <DayHours
                key={day.key}
                day={day}
                value={form.opening_hours[day.key] ?? ""}
                onChange={setHours}
              />
            ))}
          </div>
        </section>

        {/* ── Bouton de sauvegarde ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>

      </form>
    </div>
  );
}
