"use client";

/**
 * hebergement/page.tsx — Paramètres de l'hébergement
 *
 * Permet au propriétaire de modifier :
 *   - Informations de base (nom, téléphone, email, description)
 *   - Horaires de check-in / check-out
 *   - Politique d'annulation
 *   - Liste des équipements proposés
 *
 * API :
 *   GET   /properties/:id — Détail complet (champs publics)
 *   PATCH /properties/:id — Mise à jour partielle
 */

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface PropertyInfo {
  id:                  string;
  name:                string;
  phone:               string;
  email:               string | null;
  description:         string | null;
  address:             string;
  check_in_time:       string;
  check_out_time:      string;
  cancellation_policy: string | null;
  amenities:           string[];
  is_approved:         boolean;
  property_type:       string;
}

/* ============================================================
 * ÉQUIPEMENTS COURANTS
 * ============================================================ */

const COMMON_AMENITIES = [
  "WiFi", "Climatisation", "Parking", "Piscine",
  "Restaurant", "Bar", "Salle de sport", "Spa",
  "Transfert aéroport", "Service en chambre",
  "Télévision", "Coffre-fort", "Minibar", "Blanchisserie",
  "Réception 24h/24", "Sécurité", "Générateur", "Eau chaude",
];

/* ============================================================
 * PAGE
 * ============================================================ */

export default function HebergementPage() {
  const { user, accessToken } = useAuthStore();
  const propertyId = user?.propertyId;

  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [form, setForm] = useState({
    name:                "",
    phone:               "",
    email:               "",
    description:         "",
    check_in_time:       "14:00",
    check_out_time:      "12:00",
    cancellation_policy: "",
    amenities:           [] as string[],
  });

  /* --------------------------------------------------------
   * Charger les infos de la propriété
   * -------------------------------------------------------- */
  useEffect(() => {
    if (!accessToken || !propertyId) { setLoading(false); return; }

    void (async () => {
      try {
        const res = await apiClient.get<PropertyInfo>(`/properties/${propertyId}`);
        setProperty(res);
        setForm({
          name:                res.name,
          phone:               res.phone,
          email:               res.email ?? "",
          description:         res.description ?? "",
          check_in_time:       res.check_in_time,
          check_out_time:      res.check_out_time,
          cancellation_policy: res.cancellation_policy ?? "",
          amenities:           res.amenities ?? [],
        });
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken, propertyId]);

  /* --------------------------------------------------------
   * Sauvegarder
   * -------------------------------------------------------- */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/properties/${propertyId}`, {
        name:                form.name,
        phone:               form.phone,
        ...(form.email ? { email: form.email } : {}),
        ...(form.description ? { description: form.description } : {}),
        check_in_time:       form.check_in_time,
        check_out_time:      form.check_out_time,
        ...(form.cancellation_policy ? { cancellation_policy: form.cancellation_policy } : {}),
        amenities:           form.amenities,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  /* --------------------------------------------------------
   * Toggle équipement
   * -------------------------------------------------------- */
  function toggleAmenity(amenity: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
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
        <div className="h-48 bg-white rounded-xl border border-gray-100" />
      </div>
    );
  }

  const PROPERTY_TYPE_LABELS: Record<string, string> = {
    hotel:    "Hôtel",
    auberge:  "Auberge",
    campement: "Campement",
    private:  "Location privée",
    hostel:   "Hostel",
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon établissement</h1>
        {property && (
          <p className="text-sm text-gray-500 mt-0.5">
            {PROPERTY_TYPE_LABELS[property.property_type] ?? property.property_type}
            {!property.is_approved && (
              <span className="ml-2 text-orange-600">· En attente d'approbation VIVRE</span>
            )}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          ✅ Modifications enregistrées.
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom de l'établissement</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="contact@hotel.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Décrivez votre établissement, son ambiance, sa localisation…"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none"
              />
            </div>
          </div>
        </section>

        {/* ── Horaires ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Horaires</p>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Check-in à partir de</label>
                <input
                  type="time"
                  value={form.check_in_time}
                  onChange={(e) => setForm((p) => ({ ...p, check_in_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Check-out avant</label>
                <input
                  type="time"
                  value={form.check_out_time}
                  onChange={(e) => setForm((p) => ({ ...p, check_out_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Politique d'annulation ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Politique d'annulation</p>
          </div>
          <div className="px-5 py-4">
            <textarea
              value={form.cancellation_policy}
              onChange={(e) => setForm((p) => ({ ...p, cancellation_policy: e.target.value }))}
              rows={3}
              placeholder="Ex : Annulation gratuite jusqu'à 48h avant le check-in. Au-delà, une nuit est facturée."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none"
            />
          </div>
        </section>

        {/* ── Équipements ── */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">
              Équipements
              <span className="ml-2 text-gray-400 font-normal text-xs">
                ({form.amenities.length} sélectionné{form.amenities.length > 1 ? "s" : ""})
              </span>
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {COMMON_AMENITIES.map((amenity) => {
                const selected = form.amenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      selected
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-300 hover:border-orange-400"
                    }`}
                  >
                    {amenity}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

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
