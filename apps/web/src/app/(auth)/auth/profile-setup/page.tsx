/**
 * app/(auth)/profile-setup/page.tsx — S-004b : Complétion du profil (nouveaux users)
 *
 * Affiché uniquement lors du premier login (is_new_user=true depuis verify-otp).
 * L'utilisateur renseigne son prénom et son nom.
 * Email et langue sont optionnels mais suggérés.
 *
 * Après soumission → PATCH /auth/me → redirection vers le hub (/home).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface UpdateProfileBody {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  preferred_language?: "fr" | "en";
}

interface UpdateProfileResponse {
  user: {
    id: string;
    phone: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
    preferred_language: string;
    roles: string[];
  };
}

export default function ProfileSetupPage(): React.ReactElement {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Soumission du formulaire de profil --- */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError("Le prénom est obligatoire.");
      return;
    }

    if (username.trim() && !/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      setError("Nom d'utilisateur : 3 à 20 caractères, lettres/chiffres/underscore uniquement.");
      return;
    }

    setIsLoading(true);

    try {
      const updates: UpdateProfileBody = {
        first_name: firstName.trim(),
        preferred_language: language,
      };

      if (username.trim()) updates.username = username.trim();
      if (lastName.trim()) updates.last_name = lastName.trim();
      if (email.trim()) updates.email = email.trim();

      const response = await apiClient.patch<UpdateProfileResponse>(
        "/auth/me",
        updates
      );

      /* Mettre à jour le store local avec les nouvelles infos */
      if (user) {
        setUser({
          ...user,
          username: response.user.username,
          first_name: response.user.first_name,
          last_name: response.user.last_name,
          email: response.user.email,
          preferred_language: response.user.preferred_language,
        });
      }

      /* Aller vers le hub principal */
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "EMAIL_TAKEN") {
          setError("Cet email est déjà utilisé par un autre compte.");
        } else if (err.code === "USERNAME_TAKEN") {
          setError("Ce nom d'utilisateur est déjà pris.");
        } else {
          setError("Impossible de sauvegarder. Vérifiez votre connexion.");
        }
      } else {
        setError("Une erreur est survenue. Réessayez.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  /* --- Passer cette étape (profil complété plus tard) --- */
  function handleSkip(): void {
    router.push("/");
  }

  return (
    <div className="flex flex-col min-h-screen">

      {/* === EN-TÊTE === */}
      <header className="bg-gradient-to-b from-green-800 to-green-700 px-6 pt-14 pb-10 text-white">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 mb-4">
          <span className="text-2xl">👋</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">Bienvenue sur VIVRE !</h1>
        <p className="text-green-200 text-sm">
          Dites-nous comment vous appeler (vous pouvez le faire plus tard)
        </p>
      </header>

      {/* === FORMULAIRE === */}
      <main className="flex-1 px-6 pt-8 pb-6">
        <div className="max-w-sm mx-auto">

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* --- Nom d'utilisateur (optionnel — l'identité que la personne choisit d'afficher) --- */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Nom d&apos;utilisateur <span className="text-ink-soft text-xs">(optionnel)</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                autoFocus
                placeholder="awa_bf"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                className="w-full px-4 py-3 rounded-xl border border-border-subtle outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-ink"
                disabled={isLoading}
              />
              <p className="text-xs text-ink-soft mt-1">3 à 20 caractères, lettres/chiffres/underscore. Affiché à la place de votre nom si renseigné.</p>
            </div>

            {/* --- Prénom (obligatoire) --- */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="given-name"
                placeholder="Aminata"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                className="w-full px-4 py-3 rounded-xl border border-border-subtle outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-ink"
                disabled={isLoading}
              />
            </div>

            {/* --- Nom (optionnel) --- */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Nom <span className="text-ink-soft text-xs">(optionnel)</span>
              </label>
              <input
                type="text"
                autoComplete="family-name"
                placeholder="Sawadogo"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border-subtle outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-ink"
                disabled={isLoading}
              />
            </div>

            {/* --- Email (optionnel) --- */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Email <span className="text-ink-soft text-xs">(optionnel, pour les reçus)</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="aminata@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className="w-full px-4 py-3 rounded-xl border border-border-subtle outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-ink"
                disabled={isLoading}
              />
            </div>

            {/* --- Langue préférée --- */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Langue préférée
              </label>
              <div className="flex gap-3">
                {(["fr", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={[
                      "flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all",
                      language === lang
                        ? "border-green-600 dark:border-green-500 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                        : "border-border-subtle bg-surface-elevated text-ink-soft",
                    ].join(" ")}
                  >
                    {lang === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                  </button>
                ))}
              </div>
            </div>

            {/* --- Erreur --- */}
            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}

            {/* --- Bouton Continuer --- */}
            <button
              type="submit"
              disabled={isLoading || !firstName.trim()}
              className={[
                "w-full py-4 rounded-xl text-white font-semibold text-base mt-2",
                "transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                isLoading || !firstName.trim()
                  ? "bg-surface-elevated cursor-not-allowed"
                  : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
              ].join(" ")}
            >
              {isLoading ? "Enregistrement…" : "Commencer avec VIVRE"}
            </button>

            {/* --- Lien Passer --- */}
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-ink-soft hover:text-ink underline mt-1"
            >
              Passer pour l&apos;instant
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
