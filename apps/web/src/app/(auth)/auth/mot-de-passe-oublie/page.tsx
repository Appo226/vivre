/**
 * app/(auth)/auth/mot-de-passe-oublie/page.tsx — Réinitialisation du mot de passe
 *
 * Deux étapes sur un seul écran : (1) numéro → envoi d'un OTP purpose "reset",
 * (2) code + nouveau mot de passe → /api/auth/forgot-password/reset, qui reconnecte
 * directement (mêmes tokens qu'un login classique).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Step = "phone" | "reset";

interface AuthResponse {
  access_token: string;
  refresh_token: string;
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
  return "w-full px-4 py-3 rounded-xl border border-border-subtle outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-ink placeholder-gray-400 text-base";
}

export default function ForgotPasswordPage(): React.ReactElement {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("Numéro de téléphone requis.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post<{ message: string; dev_code?: string }>(
        "/auth/forgot-password/send",
        { phone: normalizePhoneForDisplay(phone) },
        { skipAuth: true }
      );
      setInfo(res.message);
      if (res.dev_code) setCode(res.dev_code);
      setStep("reset");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Trop de demandes. Réessayez dans quelques minutes.");
      } else {
        setError("Une erreur est survenue. Vérifiez votre connexion internet.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) {
      setError("Le code doit faire 6 chiffres.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.post<AuthResponse>(
        "/auth/forgot-password/reset",
        { phone: normalizePhoneForDisplay(phone), code, new_password: newPassword },
        { skipAuth: true }
      );
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
      document.cookie = `vivre_auth_token=${res.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "OTP_INVALID") setError(err.message);
        else if (err.code === "VERIFY_ATTEMPTS_EXCEEDED") setError(err.message);
        else if (err.code === "USER_NOT_FOUND") setError("Compte introuvable.");
        else setError(err.message || "Impossible de réinitialiser le mot de passe.");
      } else {
        setError("Une erreur est survenue. Vérifiez votre connexion internet.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gradient-to-b from-green-800 to-green-700 px-6 pt-14 pb-10 text-white">
        <button
          onClick={() => (step === "reset" ? setStep("phone") : router.push("/auth"))}
          className="mb-6 flex items-center gap-2 text-green-200 hover:text-white transition-colors"
          aria-label="Retour"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </button>
        <h1 className="text-2xl font-bold mb-1">Mot de passe oublié</h1>
        <p className="text-green-200 text-sm">
          {step === "phone"
            ? "Entrez votre numéro pour recevoir un code de réinitialisation."
            : "Entrez le code reçu et votre nouveau mot de passe."}
        </p>
      </header>

      <main className="flex-1 px-6 pt-8 pb-6 flex flex-col">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">
          {info && step === "reset" && (
            <p className="mb-4 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
              {info}
            </p>
          )}

          {step === "phone" ? (
            <form onSubmit={(e) => void handleSend(e)} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Numéro de téléphone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="70000000"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/[^\d\s\-+]/g, "")); setError(null); }}
                  className={inputCls()}
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">⚠️ {error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className={[
                  "w-full py-4 rounded-xl text-white font-semibold text-base mt-2 transition-all duration-200",
                  isLoading ? "bg-surface-elevated cursor-not-allowed" : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
                ].join(" ")}
              >
                {isLoading ? "…" : "Envoyer le code"}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleReset(e)} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Code reçu par SMS</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                  className={[inputCls(), "tracking-[0.3em] text-center font-mono text-lg"].join(" ")}
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Nouveau mot de passe</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="8 caractères minimum"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                  className={inputCls()}
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">⚠️ {error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className={[
                  "w-full py-4 rounded-xl text-white font-semibold text-base mt-2 transition-all duration-200",
                  isLoading ? "bg-surface-elevated cursor-not-allowed" : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
                ].join(" ")}
              >
                {isLoading ? "…" : "Réinitialiser le mot de passe"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
