"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";
import type { MeResponse } from "@/lib/api";

/* ============================================================
 * HELPERS
 * ============================================================ */

function initials(first: string | null, last: string | null, phone: string): string {
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  return phone.slice(-2);
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/* ============================================================
 * TYPES
 * ============================================================ */

interface EditForm {
  first_name: string;
  last_name:  string;
  email:      string;
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function ProfilePage(): React.ReactElement {
  const router             = useRouter();
  const { user, setUser, logout } = useAuthStore();
  const [profile,     setProfile]     = useState<MeResponse | null>(null);
  const [editing,     setEditing]     = useState(false);
  const [form,        setForm]        = useState<EditForm>({ first_name: "", last_name: "", email: "" });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Charger le profil frais depuis l'API */
  useEffect(() => {
    void (async () => {
      try {
        const me = await apiClient.get<MeResponse>("/users/me");
        setProfile(me);
      } catch {
        /* Fallback sur le store Zustand si l'API est indisponible */
        if (user) {
          setProfile({
            id: user.id, phone: user.phone,
            first_name: user.first_name, last_name: user.last_name,
            email: user.email, avatar_url: user.avatar_url,
            preferred_language: user.preferred_language,
            is_verified: true, roles: user.roles,
            created_at: new Date().toISOString(),
          });
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEditing() {
    setForm({
      first_name: profile?.first_name ?? "",
      last_name:  profile?.last_name  ?? "",
      email:      profile?.email      ?? "",
    });
    setError(null);
    setEditing(true);
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {};
      if (form.first_name !== (profile?.first_name ?? "")) body["first_name"] = form.first_name || null;
      if (form.last_name  !== (profile?.last_name  ?? "")) body["last_name"]  = form.last_name  || null;
      if (form.email      !== (profile?.email      ?? "")) body["email"]       = form.email      || null;

      if (Object.keys(body).length === 0) { setEditing(false); return; }

      const res = await apiClient.put<{ user: typeof user }>("/users/me", body);
      if (res.user) {
        setUser(res.user);
        setProfile((p) => p ? { ...p, ...body, first_name: body["first_name"] ?? p.first_name, last_name: body["last_name"] ?? p.last_name, email: body["email"] ?? p.email } : p);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "avatars");
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1"}/uploads/file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
        body: fd,
      });
      const data = await res.json() as { url?: string };
      if (data.url) {
        await apiClient.put("/users/me", { avatar_url: data.url });
        setProfile((p) => p ? { ...p, avatar_url: data.url ?? null } : p);
        if (user) setUser({ ...user, avatar_url: data.url ?? null });
      }
    } catch {
      setError("Impossible de changer la photo");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    /* Supprimer le token FCM avant de se déconnecter — arrête les push */
    try {
      const token = localStorage.getItem("vivre_fcm_token");
      if (token) {
        /* Use fetch directly — apiClient.delete doesn't accept a body */
        void fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1"}/notifications/device-token`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
          },
          body: JSON.stringify({ token }),
        });
        localStorage.removeItem("vivre_fcm_token");
      }
    } catch { /* silencieux */ }

    logout();
    document.cookie = "vivre_auth_token=; path=/; max-age=0";
    router.push("/auth");
  }

  async function toggleLanguage() {
    if (!profile) return;
    const next = profile.preferred_language === "fr" ? "en" : "fr";
    try {
      await apiClient.put("/users/me", { preferred_language: next });
      setProfile((p) => p ? { ...p, preferred_language: next } : p);
      if (user) setUser({ ...user, preferred_language: next });
    } catch { /* silently fail */ }
  }

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.phone
    : "…";

  const avatarInitials = profile
    ? initials(profile.first_name, profile.last_name, profile.phone)
    : "…";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ===== HEADER VERT ===== */}
      <div className="bg-[#1A6B3A] text-white px-4 pt-safe-top pb-20">
        <div className="flex items-center justify-between pt-4 mb-1">
          <h1 className="text-xl font-bold">Mon profil</h1>
          {!editing && (
            <button
              onClick={startEditing}
              className="text-sm text-green-200 hover:text-white font-medium"
            >
              Modifier
            </button>
          )}
        </div>
      </div>

      {/* ===== CARTE PROFIL (chevauchement sur le header) ===== */}
      <div className="px-4 -mt-14">
        <div className="bg-white rounded-2xl shadow-md p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <button
              onClick={() => fileRef.current?.click()}
              className="relative flex-shrink-0"
              aria-label="Changer la photo de profil"
            >
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover border-2 border-white shadow"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#1A6B3A] flex items-center justify-center border-2 border-white shadow">
                  <span className="text-white text-xl font-bold">{avatarInitials}</span>
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center text-[10px] shadow-sm">
                📷
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarUpload(e)}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-base truncate">{displayName}</p>
              <p className="text-sm text-gray-500">{profile?.phone ?? "…"}</p>
              {profile?.created_at && (
                <p className="text-xs text-gray-400 mt-0.5">Membre depuis {memberSince(profile.created_at)}</p>
              )}
            </div>

            {/* Badge vérifié */}
            {profile?.is_verified && (
              <span className="flex-shrink-0 text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200">
                ✓ Vérifié
              </span>
            )}
          </div>

          {/* ===== FORMULAIRE D'ÉDITION ===== */}
          {editing && (
            <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="Jean"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jean@exemple.com"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => void saveProfile()}
                  disabled={saving}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1A6B3A] rounded-xl disabled:opacity-60 active:scale-95 transition-all"
                >
                  {saving ? "Sauvegarde…" : "Enregistrer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 mt-5 space-y-4">
        {/* ===== MON ACTIVITÉ ===== */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Mon activité
          </p>
          {[
            { href: "/mes-reservations",             icon: "📋", label: "Toutes mes réservations", sub: "Vue unifiée" },
            { href: "/food/mes-commandes",          icon: "📦", label: "Mes commandes",    sub: "Repas livrés" },
            { href: "/course",                      icon: "🛵", label: "Mes courses",      sub: "Taxi & zémidjan" },
            { href: "/hebergement/mes-reservations", icon: "🏨", label: "Mes réservations", sub: "Hôtels & maisons" },
            { href: "/transport/mes-billets",       icon: "🎫", label: "Mes billets",      sub: "Bus & voyages" },
            { href: "/evenements/mes-billets",      icon: "🎟️", label: "Mes événements",   sub: "FESPACO, SIAO…" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="text-xl w-8 text-center">{item.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
              <span className="text-gray-300 text-sm">›</span>
            </Link>
          ))}
        </div>

        {/* ===== PARAMÈTRES ===== */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Paramètres
          </p>

          {/* Langue */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50">
            <div className="flex items-center gap-4">
              <span className="text-xl w-8 text-center">🌐</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Langue</p>
                <p className="text-xs text-gray-400">Interface de l&apos;application</p>
              </div>
            </div>
            <button
              onClick={() => void toggleLanguage()}
              className="flex items-center gap-1 bg-gray-100 rounded-xl p-1"
            >
              {(["fr", "en"] as const).map((lang) => (
                <span
                  key={lang}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    (profile?.preferred_language ?? "fr") === lang
                      ? "bg-[#1A6B3A] text-white"
                      : "text-gray-500"
                  }`}
                >
                  {lang.toUpperCase()}
                </span>
              ))}
            </button>
          </div>

          {/* Notifications */}
          <Link
            href="/profile/notifications"
            className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="text-xl w-8 text-center">🔔</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              <p className="text-xs text-gray-400">Gérer les alertes</p>
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </Link>
        </div>

        {/* ===== PORTEFEUILLE ===== */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Finances
          </p>
          <Link
            href="/portefeuille"
            className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="text-xl w-8 text-center">💰</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Portefeuille VIVRE</p>
              <p className="text-xs text-gray-400">Solde, recharge & historique</p>
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </Link>
        </div>

        {/* ===== ESPACE FOURNISSEUR ===== */}
        {profile?.roles.includes("supplier") && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
              Mon espace fournisseur
            </p>
            {[
              { href: "/fournisseur/restaurant", icon: "🍽️", label: "Mes restaurants",   sub: "Commandes & menu" },
              { href: "/fournisseur/hebergement", icon: "🏨", label: "Mes hébergements", sub: "Réservations & disponibilités" },
              { href: "/fournisseur/evenements",  icon: "🎟️", label: "Mes événements",   sub: "Ventes de billets" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <span className="text-xl w-8 text-center">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
                <span className="text-gray-300 text-sm">›</span>
              </Link>
            ))}
          </div>
        )}

        {/* ===== ADMINISTRATION ===== */}
        {profile?.roles.includes("admin") && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
              Administration
            </p>
            <Link
              href="/admin"
              className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="text-xl w-8 text-center">⚙️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Dashboard administrateur</p>
                <p className="text-xs text-gray-400">Approbations, stats & remboursements</p>
              </div>
              <span className="text-gray-300 text-sm">›</span>
            </Link>
          </div>
        )}

        {/* ===== COMPTE ===== */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Compte
          </p>

          {/* Devenir livreur — seulement si pas encore driver */}
          {!profile?.roles.includes("driver") && (
            <Link
              href="/devenir-livreur"
              className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="text-xl w-8 text-center">🛵</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Devenir livreur</p>
                <p className="text-xs text-gray-400">Gagnez de l&apos;argent en livrant</p>
              </div>
              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                Nouveau
              </span>
            </Link>
          )}

          {/* Tableau de bord livreur — si driver */}
          {profile?.roles.includes("driver") && (
            <Link
              href="/livreur"
              className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span className="text-xl w-8 text-center">🛵</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Tableau de bord livreur</p>
                <p className="text-xs text-gray-400">Courses, gains, versements</p>
              </div>
              <span className="text-gray-300 text-sm">›</span>
            </Link>
          )}

          {/* Aide */}
          <div className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-50">
            <span className="text-xl w-8 text-center">❓</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Aide & support</p>
              <p className="text-xs text-gray-400">Contacter l&apos;équipe VIVRE</p>
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </div>

          {/* Déconnexion */}
          <button
            onClick={() => void handleLogout()}
            className="w-full flex items-center gap-4 px-5 py-4 border-t border-gray-50 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
          >
            <span className="text-xl w-8 text-center">🚪</span>
            <p className="text-sm font-semibold text-red-600">Se déconnecter</p>
          </button>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-gray-300 pb-2">VIVRE v1.0 · Ouagadougou, Burkina Faso</p>
      </div>
    </div>
  );
}
