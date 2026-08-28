/**
 * app/(auth)/auth/page.tsx — Connexion / Inscription VIVRE (téléphone + mot de passe)
 *
 * Remplace l'ancien flux OTP (numéro → SMS → code) — plus rapide (une seule page,
 * pas d'aller-retour SMS/WhatsApp) et ne dépend plus d'aucun canal tiers pour se
 * connecter. /api/auth/send-otp et /api/auth/verify-otp restent en place côté API,
 * juste plus utilisés comme point d'entrée principal.
 *
 * Un seul écran, deux modes (connexion / inscription) — pas d'étape "complétion du
 * profil" séparée : tout ce qui est nécessaire est déjà demandé à l'inscription.
 */

"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { VivreLogo } from "@/components/VivreLogo";

type Mode = "login" | "signup";

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  dev_code?: string;
  user: {
    id: string;
    phone: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
    preferred_language: string;
    is_verified: boolean;
    roles: string[];
  };
}

/** Bannière contextuelle pour les redirections fournisseur */
function SupplierBanner(): React.ReactElement | null {
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "";
  if (!redirect.includes("fournisseur")) return null;
  return (
    <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
      🏪 <strong>Connexion fournisseur</strong> — Connectez-vous pour accéder à votre espace partenaire.
    </div>
  );
}

/** Normalise un numéro pour l'envoi — accepte le format local BF (70000000) ou international. */
function normalizePhoneForDisplay(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  if (digits.startsWith("226") && digits.length === 11) return `+${digits}`;
  if (digits.length === 8) return `+226${digits}`;
  if (digits.length > 8) return `+${digits}`;
  return cleaned;
}

function inputCls(): string {
  return "w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-gray-900 placeholder-gray-400 text-base";
}

function AuthForm(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function persistAuth(res: AuthResponse): void {
    setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
    /* Le middleware lit ce cookie pour protéger les routes — voir middleware.ts */
    document.cookie = `vivre_auth_token=${res.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  }

  function afterAuthSuccess(res: AuthResponse): void {
    persistAuth(res);
    const redirect = params.get("redirect");
    router.push(redirect && redirect.startsWith("/") ? redirect : "/");
  }

  /* Le compte démarre toujours non vérifié — on envoie systématiquement vers l'écran de
   * confirmation OTP après une inscription, pas après une connexion (voir gate côté
   * réservation dans events/bookings, pas ici — la vérification n'est pas bloquante
   * pour se connecter, seulement pour réserver un billet). */
  function afterSignupSuccess(res: AuthResponse): void {
    persistAuth(res);
    const redirect = params.get("redirect") ?? "";
    const qs = new URLSearchParams();
    if (redirect.startsWith("/")) qs.set("redirect", redirect);
    if (res.dev_code) qs.set("dev_code", res.dev_code);
    const query = qs.toString();
    router.push(`/auth/verify${query ? `?${query}` : ""}`);
  }

  async function handleLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !password) {
      setError("Numéro de téléphone et mot de passe requis.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post<AuthResponse>(
        "/auth/login",
        { phone: normalizePhoneForDisplay(phone), password },
        { skipAuth: true }
      );
      afterAuthSuccess(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ACCOUNT_LOCKED") setError(err.message);
        else if (err.code === "ACCOUNT_SUSPENDED") setError(err.message);
        else if (err.code === "PASSWORD_NOT_SET") setError(err.message);
        else if (err.status === 422) setError("Numéro invalide. Exemple : 70000000");
        else setError("Numéro de téléphone ou mot de passe incorrect.");
      } else {
        setError("Une erreur est survenue. Vérifiez votre connexion internet.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !firstName.trim() || !lastName.trim() || !phone.trim() || !password) {
      setError("Tous les champs marqués * sont obligatoires.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post<AuthResponse>(
        "/auth/register",
        {
          username: username.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: normalizePhoneForDisplay(phone),
          password,
          ...(email.trim() && { email: email.trim() }),
        },
        { skipAuth: true }
      );
      afterSignupSuccess(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PHONE_TAKEN") setError(err.message);
        else if (err.code === "USERNAME_TAKEN") setError(err.message);
        else if (err.code === "EMAIL_TAKEN") setError(err.message);
        else if (err.status === 422) setError(err.message || "Données invalides.");
        else setError("Impossible de créer le compte. Réessayez.");
      } else {
        setError("Une erreur est survenue. Vérifiez votre connexion internet.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function switchMode(next: Mode): void {
    setMode(next);
    setError(null);
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* === EN-TÊTE VERT FORÊT VIVRE === */}
      <header className="hero-texture px-6 pt-16 pb-10 text-white text-center overflow-hidden">
        <div className="animate-fade-in inline-flex flex-col items-center gap-2 mb-6">
          <VivreLogo size={68} variant="light" showTagline />
        </div>
        <div className="animate-slide-up flex items-center justify-center gap-2 flex-wrap" style={{ animationDelay: "80ms" }}>
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full px-3 py-1.5 font-jakarta text-[11px] font-semibold text-white/90">
            🎫 Billet QR instantané
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full px-3 py-1.5 font-jakarta text-[11px] font-semibold text-white/90">
            🔒 Paiement sécurisé
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full px-3 py-1.5 font-jakarta text-[11px] font-semibold text-white/90">
            📍 Partout au Burkina
          </span>
        </div>
      </header>

      <div className="brand-pattern h-3.5 w-full" />

      {/* === FORMULAIRE === */}
      <main className="flex-1 px-6 pt-8 pb-6 flex flex-col">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === "login" ? "Bon retour !" : "Bienvenue !"}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {mode === "login"
              ? "Connectez-vous avec votre numéro et votre mot de passe."
              : "Créez votre compte pour découvrir et réserver des événements."}
          </p>

          <Suspense>
            <SupplierBanner />
          </Suspense>

          {/* --- Onglets Connexion / Inscription --- */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={[
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                  mode === m ? "bg-white text-green-700 shadow-sm" : "text-gray-500",
                ].join(" ")}
              >
                {m === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void (mode === "login" ? handleLogin(e) : handleSignup(e))} className="flex flex-col gap-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nom d&apos;utilisateur <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    placeholder="awa_bf"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(null); }}
                    className={inputCls()}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Prénom <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      autoComplete="given-name"
                      placeholder="Aminata"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                      className={inputCls()}
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nom <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      autoComplete="family-name"
                      placeholder="Sawadogo"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setError(null); }}
                      className={inputCls()}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Numéro de téléphone <span className="text-red-500">*</span>
              </label>
              <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-100 transition-all">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-r border-gray-300 shrink-0">
                  <span className="text-lg leading-none">📱</span>
                </div>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="70000000 ou +15747100846"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d\s\-+]/g, ""));
                    setError(null);
                  }}
                  className="flex-1 px-4 py-3 text-gray-900 placeholder-gray-400 bg-white outline-none text-base"
                  disabled={isLoading}
                />
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email <span className="text-gray-400 text-xs">(optionnel — pour récupérer l&apos;accès et vos reçus)</span>
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="aminata@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  className={inputCls()}
                  disabled={isLoading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "8 caractères minimum" : "••••••••"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className={inputCls()}
                disabled={isLoading}
              />
              {mode === "login" && (
                <a href="/auth/mot-de-passe-oublie" className="block mt-1.5 text-right text-sm text-green-700 hover:text-green-800 underline">
                  Mot de passe oublié ?
                </a>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 flex items-start gap-1" role="alert">
                <span aria-hidden>⚠️</span>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={[
                "w-full py-4 rounded-xl text-white font-semibold text-base mt-2",
                "transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                isLoading ? "bg-gray-300 cursor-not-allowed" : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
              ].join(" ")}
            >
              {isLoading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>

            <p className="text-center text-xs text-gray-400 mt-1 px-4">
              En continuant, vous acceptez nos{" "}
              <a href="/terms" className="text-green-700 underline">Conditions d&apos;utilisation</a>{" "}
              et notre{" "}
              <a href="/privacy" className="text-green-700 underline">Politique de confidentialité</a>.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(): React.ReactElement {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
