/**
 * app/(auth)/profile-setup/page.tsx — S-004b : Complétion du profil (nouveaux users)
 *
 * Affiché uniquement lors du premier login (is_new_user=true depuis verify-otp).
 * L'utilisateur renseigne son prénom et son nom.
 * Email et langue sont optionnels mais suggérés.
 *
 * Après soumission → PUT /users/me → redirection vers le hub (/home).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface UpdateProfileBody {
  first_name?: string;
  last_name?: string;
  email?: string;
  preferred_language?: "fr" | "en";
}

interface UpdateProfileResponse {
  user: {
    id: string;
    phone: string;
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

    setIsLoading(true);

    try {
      const updates: UpdateProfileBody = {
        first_name: firstName.trim(),
        preferred_language: language,
      };

      if (lastName.trim()) updates.last_name = lastName.trim();
      if (email.trim()) updates.email = email.trim();

      const response = await apiClient.put<UpdateProfileResponse>(
        "/users/me",
        updates
      );

      /* Mettre à jour le store local avec les nouvelles infos */
      if (user) {
        setUser({
          ...user,
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
        if (err.code === "EMAIL_ALREADY_EXISTS") {
          setError("Cet email est déjà utilisé par un autre compte.");
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

            {/* --- Prénom (obligatoire) --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="given-name"
                autoFocus
                placeholder="Aminata"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-gray-900"
                disabled={isLoading}
              />
            </div>

            {/* --- Nom (optionnel) --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom <span className="text-gray-400 text-xs">(optionnel)</span>
              </label>
              <input
                type="text"
                autoComplete="family-name"
                placeholder="Sawadogo"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-gray-900"
                disabled={isLoading}
              />
            </div>

            {/* --- Email (optionnel) --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-gray-400 text-xs">(optionnel — pour les reçus)</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="aminata@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition-all text-gray-900"
                disabled={isLoading}
              />
            </div>

            {/* --- Langue préférée --- */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                        ? "border-green-600 bg-green-50 text-green-700"
                        : "border-gray-200 bg-gray-50 text-gray-600",
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
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
              ].join(" ")}
            >
              {isLoading ? "Enregistrement…" : "Commencer avec VIVRE"}
            </button>

            {/* --- Lien Passer --- */}
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 underline mt-1"
            >
              Passer pour l&apos;instant
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
