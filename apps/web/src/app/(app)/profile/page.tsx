"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore } from "@/store/theme.store";
import { apiClient, ApiError } from "@/lib/api";
import type { MeResponse } from "@/lib/api";

/* ============================================================
 * TRANSLATIONS
 * ============================================================ */

const T = {
  fr: {
    my_profile: "Mon profil", edit: "Modifier", verified: "Vérifié",
    my_activity: "MON ACTIVITÉ", settings: "PARAMÈTRES", account: "COMPTE",
    events: "Mes billets",
    language: "Langue", notifications: "Notifications",
    help: "Aide & support", logout: "Se déconnecter",
    theme: "Thème", theme_light: "Clair", theme_dark: "Sombre",
  },
  en: {
    my_profile: "My profile", edit: "Edit", verified: "Verified",
    my_activity: "MY ACTIVITY", settings: "SETTINGS", account: "ACCOUNT",
    events: "My tickets",
    language: "Language", notifications: "Notifications",
    help: "Help & support", logout: "Sign out",
    theme: "Theme", theme_light: "Light", theme_dark: "Dark",
  },
} as const;

type Lang = keyof typeof T;

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

function vivreId(uuid: string): string {
  // Format: VIV-XXXXXX (first 6 hex chars of UUID, uppercase)
  return `VIV-${uuid.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/* Bonjour/Good morning avant 18h, Bonsoir/Good evening après — heure locale de l'appareil. */
function timeGreeting(lang: Lang): string {
  const evening = new Date().getHours() >= 18;
  if (lang === "en") return evening ? "Good evening" : "Good morning";
  return evening ? "Bonsoir" : "Bonjour";
}

/* ============================================================
 * TYPES
 * ============================================================ */

interface EditForm {
  username:   string;
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
  const [form,        setForm]        = useState<EditForm>({ username: "", first_name: "", last_name: "", email: "" });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [lang, setLang] = useState<Lang>("fr");
  const [greeting, setGreeting] = useState<{ message: string; enabled: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useThemeStore();

  /* Lire la langue depuis localStorage au montage */
  useEffect(() => {
    const stored = localStorage.getItem("vivre_lang");
    if (stored === "en" || stored === "fr") setLang(stored);
  }, []);

  /* Message d'accueil éditable par un admin — silencieux si indisponible, jamais bloquant */
  useEffect(() => {
    void apiClient
      .get<{ message: string; enabled: boolean }>("/settings/greeting")
      .then(setGreeting)
      .catch(() => { /* pas de message affiché, tant pis */ });
  }, []);

  /* Charger le profil frais depuis l'API */
  useEffect(() => {
    void (async () => {
      try {
        const me = await apiClient.get<MeResponse>("/auth/me");
        setProfile(me);
      } catch {
        /* Fallback sur le store Zustand si l'API est indisponible */
        if (user) {
          setProfile({
            id: user.id, phone: user.phone,
            username: user.username,
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
      username:   profile?.username   ?? "",
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
      if (form.username   !== (profile?.username   ?? "")) body["username"]   = form.username   || null;
      if (form.first_name !== (profile?.first_name ?? "")) body["first_name"] = form.first_name || null;
      if (form.last_name  !== (profile?.last_name  ?? "")) body["last_name"]  = form.last_name  || null;
      if (form.email      !== (profile?.email      ?? "")) body["email"]       = form.email      || null;

      if (Object.keys(body).length === 0) { setEditing(false); return; }

      const res = await apiClient.patch<{ user: typeof user }>("/auth/me", body);
      if (res.user) {
        setUser(res.user);
        setProfile((p) => p ? { ...p, ...body, username: body["username"] ?? p.username, first_name: body["first_name"] ?? p.first_name, last_name: body["last_name"] ?? p.last_name, email: body["email"] ?? p.email } : p);
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
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "/api"}/uploads/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
        body: fd,
      });
      const data = await res.json() as { url?: string };
      if (data.url) {
        await apiClient.patch("/auth/me", { avatar_url: data.url });
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
        void fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "/api"}/notifications/device-token`, {
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
    const next: Lang = (profile.preferred_language === "fr" ? "en" : "fr") as Lang;
    try {
      await apiClient.patch("/auth/me", { preferred_language: next });
      setProfile((p) => p ? { ...p, preferred_language: next } : p);
      if (user) setUser({ ...user, preferred_language: next });
      localStorage.setItem("vivre_lang", next);
      window.location.reload();
    } catch { /* silently fail */ }
  }

  const t = T[lang];

  const realName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.phone
    : null;

  /* Le nom d'utilisateur, quand renseigné, est l'identité que la personne a choisi
     d'afficher — il prend la place du nom réel en tête du profil. */
  const displayName = profile?.username ? `@${profile.username}` : realName ?? "…";

  const avatarInitials = profile
    ? initials(profile.first_name, profile.last_name, profile.phone)
    : "…";

  return (
    <div className="min-h-screen bg-page pb-24">
      {/* ===== HEADER VERT ===== */}
      <div className="bg-[#1A6B3A] text-white px-4 pt-safe-top pb-20">
        <div className="flex items-start justify-between gap-3 pt-4 mb-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {profile?.first_name ? `${timeGreeting(lang)}, ${profile.first_name} 👋` : t.my_profile}
            </h1>
            {/* Message admin — actuellement rédigé en français uniquement, donc affiché
                seulement en langue FR pour éviter un mélange FR/EN dans le header */}
            {profile?.first_name && lang === "fr" && greeting?.enabled && greeting.message && (
              <p className="text-white font-semibold text-base mt-0.5">{greeting.message}</p>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="text-sm text-green-200 hover:text-white font-medium flex-shrink-0 pt-1.5"
            >
              {t.edit}
            </button>
          )}
        </div>
      </div>

      {/* ===== CARTE PROFIL (chevauchement sur le header) ===== */}
      <div className="px-4 -mt-14">
        <div className="bg-surface-card rounded-2xl shadow-md p-5">
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
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-surface-card border border-border-subtle rounded-full flex items-center justify-center text-[10px] shadow-sm">
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
              <p className="font-bold text-ink text-base truncate">{displayName}</p>
              {profile?.username && realName && (
                <p className="text-sm text-ink-soft truncate">{realName}</p>
              )}
              <p className="text-sm text-ink-soft">{profile?.phone ?? "…"}</p>
              {profile?.created_at && (
                <p className="text-xs text-ink-soft mt-0.5">Membre depuis {memberSince(profile.created_at)}</p>
              )}
              {profile?.id && (
                <p className="text-xs font-mono text-ink-soft mt-0.5">
                  <span className="text-ink-soft mr-1">ID VIVRE</span>
                  🪪 {vivreId(profile.id)}
                </p>
              )}
            </div>

            {/* Badge vérifié */}
            {profile?.is_verified && (
              <span className="flex-shrink-0 text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 font-semibold px-2 py-0.5 rounded-full border border-green-200 dark:border-green-900">
                ✓ {t.verified}
              </span>
            )}
          </div>

          {/* ===== FORMULAIRE D'ÉDITION ===== */}
          {editing && (
            <div className="mt-5 pt-5 border-t border-border-subtle space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Nom d&apos;utilisateur</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="awa_bf"
                  className="w-full border border-border-subtle bg-surface-card text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="Jean"
                    className="w-full border border-border-subtle bg-surface-card text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full border border-border-subtle bg-surface-card text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jean@exemple.com"
                  className="w-full border border-border-subtle bg-surface-card text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-ink-soft bg-surface-elevated rounded-xl hover:bg-surface-elevated transition-colors"
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
        {/* ===== ESPACE FOURNISSEUR ===== */}
        {/* En haut, avant "Mon activité" — c'est là que vit le scanner, la seule vraie chose
            qu'un organisateur va chercher activement à un point donné (le jour de l'événement,
            probablement pressé) ; "Mes billets"/"Mes événements" juste en dessous se ressemblaient
            trop (même icône, mots quasi identiques) et menaient les organisateurs au mauvais
            endroit — voir le commentaire sur `t.events` plus bas. */}
        {profile?.roles.includes("supplier") && (
          <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden border-2 border-green-100 dark:border-green-900">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-widest">
              Mon espace fournisseur
            </p>
            {[
              { href: "/fournisseur/evenements",  icon: "🎪", label: "Mes événements organisés",   sub: "Ventes, réservations, scanner à l'entrée" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 px-5 py-3.5 border-t border-border-subtle hover:bg-surface-elevated active:bg-surface-elevated transition-colors"
              >
                <span className="text-xl w-8 text-center">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="text-xs text-ink-soft">{item.sub}</p>
                </div>
                <span className="text-ink-soft text-sm">›</span>
              </Link>
            ))}
          </div>
        )}

        {/* ===== MON ACTIVITÉ ===== */}
        <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-ink-soft uppercase tracking-widest">
            {t.my_activity}
          </p>
          {[
            { href: "/evenements/mes-billets",      icon: "🎟️", label: t.events,         sub: "Billets que vous avez achetés" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-5 py-3.5 border-t border-border-subtle hover:bg-surface-elevated active:bg-surface-elevated transition-colors"
            >
              <span className="text-xl w-8 text-center">{item.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{item.label}</p>
                <p className="text-xs text-ink-soft">{item.sub}</p>
              </div>
              <span className="text-ink-soft text-sm">›</span>
            </Link>
          ))}
        </div>

        {/* ===== PARAMÈTRES ===== */}
        <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-ink-soft uppercase tracking-widest">
            {t.settings}
          </p>

          {/* Langue */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border-subtle">
            <div className="flex items-center gap-4">
              <span className="text-xl w-8 text-center">🌐</span>
              <div>
                <p className="text-sm font-semibold text-ink">{t.language}</p>
                <p className="text-xs text-ink-soft">Interface de l&apos;application</p>
              </div>
            </div>
            <button
              onClick={() => void toggleLanguage()}
              className="flex items-center gap-1 bg-surface-elevated rounded-xl p-1"
            >
              {(["fr", "en"] as const).map((lang) => (
                <span
                  key={lang}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    (profile?.preferred_language ?? "fr") === lang
                      ? "bg-[#1A6B3A] text-white"
                      : "text-ink-soft"
                  }`}
                >
                  {lang.toUpperCase()}
                </span>
              ))}
            </button>
          </div>

          {/* Thème */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border-subtle">
            <div className="flex items-center gap-4">
              <span className="text-xl w-8 text-center">🌓</span>
              <div>
                <p className="text-sm font-semibold text-ink">{t.theme}</p>
                <p className="text-xs text-ink-soft">Apparence de l&apos;application</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface-elevated rounded-xl p-1">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTheme(option)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    theme === option
                      ? "bg-[#1A6B3A] text-white"
                      : "text-ink-soft"
                  }`}
                >
                  {t[`theme_${option}`]}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <Link
            href="/profile/notifications"
            className="flex items-center gap-4 px-5 py-3.5 border-t border-border-subtle hover:bg-surface-elevated active:bg-surface-elevated transition-colors"
          >
            <span className="text-xl w-8 text-center">🔔</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{t.notifications}</p>
              <p className="text-xs text-ink-soft">Gérer les alertes</p>
            </div>
            <span className="text-ink-soft text-sm">›</span>
          </Link>
        </div>

        {/* ===== ADMINISTRATION ===== */}
        {profile?.roles.includes("admin") && (
          <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-ink-soft uppercase tracking-widest">
              Administration
            </p>
            <Link
              href="/admin"
              className="flex items-center gap-4 px-5 py-3.5 border-t border-border-subtle hover:bg-surface-elevated active:bg-surface-elevated transition-colors"
            >
              <span className="text-xl w-8 text-center">⚙️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">Dashboard administrateur</p>
                <p className="text-xs text-ink-soft">Approbations, vérifications, remboursements, versements</p>
              </div>
              <span className="text-ink-soft text-sm">›</span>
            </Link>
          </div>
        )}

        {/* ===== COMPTE ===== */}
        <div className="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-ink-soft uppercase tracking-widest">
            {t.account}
          </p>

          {/* Aide */}
          <div className="flex items-center gap-4 px-5 py-3.5 border-t border-border-subtle">
            <span className="text-xl w-8 text-center">❓</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{t.help}</p>
              <p className="text-xs text-ink-soft">Contacter l&apos;équipe VIVRE</p>
            </div>
            <span className="text-ink-soft text-sm">›</span>
          </div>

          {/* Déconnexion */}
          <button
            onClick={() => void handleLogout()}
            className="w-full flex items-center gap-4 px-5 py-4 border-t border-border-subtle hover:bg-red-50 active:bg-red-100 transition-colors text-left"
          >
            <span className="text-xl w-8 text-center">🚪</span>
            <p className="text-sm font-semibold text-red-600">{t.logout}</p>
          </button>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-ink-soft pb-2">VIVRE v1.0 · Ouagadougou, Burkina Faso</p>
      </div>
    </div>
  );
}
