"use client";

/**
 * menu/page.tsx — Gestion du menu restaurant
 *
 * Permet au propriétaire de :
 *   - Voir toutes ses catégories et tous ses plats (y compris indisponibles)
 *   - Activer / désactiver un plat en un clic (toggle is_available)
 *   - Mettre en avant un plat (toggle is_featured)
 *   - Changer rapidement le prix d'un plat
 *
 * La création de plats et de catégories est déléguée à des formulaires
 * modaux simples pour garder la page lisible.
 *
 * API :
 *   GET  /restaurants/:id/menu         — toutes catégories + tous plats
 *   PATCH /restaurants/:id/items/:itemId — toggle disponibilité / prix
 *   POST  /restaurants/:id/categories  — nouvelle catégorie
 *   POST  /restaurants/:id/items       — nouveau plat
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface MenuItem {
  id:           string;
  name:         string;
  description:  string | null;
  price:        number;
  is_available: boolean;
  is_featured:  boolean;
  prep_minutes: number | null;
}

interface MenuCategory {
  id:        string;
  name:      string;
  is_active: boolean;
  items:     MenuItem[];
}

/* ============================================================
 * COMPOSANT LIGNE PLAT
 * ============================================================ */

function ItemRow({
  item,
  restaurantId,
  onUpdated,
}: {
  item: MenuItem;
  restaurantId: string;
  onUpdated: (itemId: string, changes: Partial<MenuItem>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice]     = useState(item.price.toString());
  const [saving, setSaving]   = useState(false);

  async function toggle(field: "is_available" | "is_featured") {
    setSaving(true);
    try {
      await apiClient.patch(`/restaurants/${restaurantId}/items/${item.id}`, {
        [field]: !item[field],
      });
      onUpdated(item.id, { [field]: !item[field] });
    } catch { /* ignore — bouton revient visuellement à son état précédent */ }
    finally { setSaving(false); }
  }

  async function savePrice() {
    const parsed = parseInt(price, 10);
    if (isNaN(parsed) || parsed <= 0) { setPrice(item.price.toString()); setEditing(false); return; }
    setSaving(true);
    try {
      await apiClient.patch(`/restaurants/${restaurantId}/items/${item.id}`, { price: parsed });
      onUpdated(item.id, { price: parsed });
      setEditing(false);
    } catch { setPrice(item.price.toString()); setEditing(false); }
    finally { setSaving(false); }
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${!item.is_available ? "opacity-60" : ""}`}>
      {/* Indicateur disponibilité */}
      <button
        onClick={() => void toggle("is_available")}
        disabled={saving}
        title={item.is_available ? "Désactiver" : "Activer"}
        className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors ${
          item.is_available ? "bg-green-500" : "bg-gray-300"
        }`}
      />

      {/* Nom + description */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-gray-900 ${!item.is_available ? "line-through text-gray-400" : ""}`}>
          {item.name}
          {item.is_featured && <span className="ml-1 text-yellow-500">★</span>}
        </p>
        {item.description && (
          <p className="text-xs text-gray-400 truncate">{item.description}</p>
        )}
      </div>

      {/* Prix — cliquable pour éditer */}
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => void savePrice()}
            onKeyDown={(e) => { if (e.key === "Enter") void savePrice(); if (e.key === "Escape") { setPrice(item.price.toString()); setEditing(false); } }}
            className="w-24 border border-orange-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
            autoFocus
          />
          <span className="text-xs text-gray-400">F</span>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-gray-600 hover:text-orange-600 font-medium min-w-[72px] text-right"
          title="Cliquer pour modifier le prix"
        >
          {item.price.toLocaleString()} F
        </button>
      )}

      {/* Mise en avant */}
      <button
        onClick={() => void toggle("is_featured")}
        disabled={saving}
        title={item.is_featured ? "Retirer de la mise en avant" : "Mettre en avant"}
        className={`text-lg transition-opacity ${item.is_featured ? "opacity-100" : "opacity-20 hover:opacity-60"}`}
      >
        ★
      </button>
    </div>
  );
}

/* ============================================================
 * MODAL NOUVEAU PLAT
 * ============================================================ */

function NewItemModal({
  restaurantId,
  categories,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  categories:   MenuCategory[];
  onClose:      () => void;
  onCreated:    () => void;
}) {
  const [form, setForm] = useState({
    category_id: categories[0]?.id ?? "",
    name:        "",
    description: "",
    price:       "",
    prep_minutes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseInt(form.price, 10);
    if (!form.name || isNaN(price) || !form.category_id) return;

    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/restaurants/${restaurantId}/items`, {
        category_id:  form.category_id,
        name:         form.name,
        ...(form.description ? { description: form.description } : {}),
        price,
        ...(form.prep_minutes ? { prep_minutes: parseInt(form.prep_minutes, 10) } : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Ajouter un plat</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom du plat *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ex : Poulet braisé"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Ingrédients, accompagnement…"
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Prix (FCFA) *</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                placeholder="1500"
                min="1"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Préparation (min)</label>
              <input
                type="number"
                value={form.prep_minutes}
                onChange={(e) => setForm((p) => ({ ...p, prep_minutes: e.target.value }))}
                placeholder="15"
                min="1"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !form.name || !form.price || !form.category_id}
              className="flex-1 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
 * MODAL NOUVELLE CATÉGORIE
 * ============================================================ */

function NewCategoryModal({
  restaurantId,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  onClose:      () => void;
  onCreated:    () => void;
}) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/restaurants/${restaurantId}/categories`, { name: name.trim() });
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Nouvelle catégorie</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Entrées, Plats du jour…"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            autoFocus
          />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50">
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function MenuPage() {
  const { user, accessToken } = useAuthStore();
  const restaurantId = user?.restaurantId;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showNewItem, setShowNewItem]         = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);

  /* --------------------------------------------------------
   * Charger le menu complet
   * -------------------------------------------------------- */
  const loadMenu = useCallback(async () => {
    if (!accessToken || !restaurantId) { setLoading(false); return; }

    try {
      const res = await apiClient.get<{ categories: MenuCategory[] }>(
        `/restaurants/${restaurantId}/menu`
      );
      setCategories(res.categories ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, restaurantId]);

  useEffect(() => { void loadMenu(); }, [loadMenu]);

  /* --------------------------------------------------------
   * Mise à jour optimiste d'un plat après toggle
   * -------------------------------------------------------- */
  function handleItemUpdated(itemId: string, changes: Partial<MenuItem>) {
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.id === itemId ? { ...item, ...changes } : item
        ),
      }))
    );
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  const totalItems     = categories.reduce((s, c) => s + c.items.length, 0);
  const availableItems = categories.reduce((s, c) => s + c.items.filter((i) => i.is_available).length, 0);

  return (
    <div className="max-w-3xl space-y-4">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {availableItems} / {totalItems} plats disponibles
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewCategory(true)}
            className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
          >
            + Catégorie
          </button>
          <button
            onClick={() => setShowNewItem(true)}
            disabled={categories.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50"
          >
            + Plat
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Légende */}
      <div className="flex items-center gap-4 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> Indisponible
        </span>
        <span className="flex items-center gap-1 text-yellow-500">★ En avant</span>
        <span>· Cliquer prix pour éditer</span>
      </div>

      {/* ── Catégories + plats ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-32 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="text-gray-500 font-medium">Votre menu est vide</p>
          <p className="text-gray-400 text-sm mt-1">Commencez par créer une catégorie</p>
          <button
            onClick={() => setShowNewCategory(true)}
            className="mt-4 px-6 py-2 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600"
          >
            Créer une catégorie
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* En-tête catégorie */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{category.name}</p>
                  <span className="text-xs text-gray-400">
                    {category.items.filter((i) => i.is_available).length}/{category.items.length}
                  </span>
                </div>
              </div>

              {/* Plats */}
              {category.items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400 italic">
                  Aucun plat dans cette catégorie
                </p>
              ) : (
                category.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    restaurantId={restaurantId!}
                    onUpdated={handleItemUpdated}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showNewCategory && restaurantId && (
        <NewCategoryModal
          restaurantId={restaurantId}
          onClose={() => setShowNewCategory(false)}
          onCreated={() => void loadMenu()}
        />
      )}
      {showNewItem && restaurantId && (
        <NewItemModal
          restaurantId={restaurantId}
          categories={categories}
          onClose={() => setShowNewItem(false)}
          onCreated={() => void loadMenu()}
        />
      )}

    </div>
  );
}
