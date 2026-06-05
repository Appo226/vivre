/**
 * app/(auth)/page.tsx — S-002 : Saisie du numéro de téléphone
 *
 * Premier écran d'authentification VIVRE.
 * L'utilisateur saisit son numéro burkinabè (+226) pour recevoir un code OTP par SMS.
 *
 * UX adaptée au Burkina Faso :
 * - Flag BF affiché avec indicatif (+226) — les utilisateurs locaux tapent souvent "70..." sans +226
 * - Clavier numérique suggéré (inputMode="tel")
 * - Message d'erreur en français clair (pas de jargon technique)
 * - Bouton désactivé pendant l'envoi (évite les double-clics sur réseau lent)
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type SendOtpResponse, ApiError } from "@/lib/api";

/**
 * Normalise un numéro de téléphone burkinabè pour l'affichage et l'envoi.
 * Ajoute +226 si l'utilisateur n'a saisi que les 8 derniers chiffres.
 */
function normalizePhoneForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("226")) return `+${digits}`;
  if (digits.length === 8) return `+226${digits}`;
  return raw;
}

export default function AuthPage(): React.ReactElement {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Soumission du formulaire --- */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) {
      setError("Veuillez saisir votre numéro de téléphone.");
      return;
    }

    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhoneForDisplay(phone);

      const res = await apiClient.post<SendOtpResponse>(
        "/auth/send-otp",
        { phone: normalizedPhone },
        { skipAuth: true }
      );

      /* In dev, the API returns the OTP code directly — pass it to verify page */
      const devCode = (res as SendOtpResponse & { dev_code?: string }).dev_code;
      const verifyUrl = `/auth/verify?phone=${encodeURIComponent(normalizedPhone)}${devCode ? `&dev_code=${devCode}` : ""}`;
      router.push(verifyUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Trop de demandes. Attendez quelques minutes avant de réessayer.");
        } else if (err.status === 422) {
          setError("Numéro invalide. Format attendu : +226 70 00 00 00 ou 70000000");
        } else {
          setError("Impossible d'envoyer le SMS. Vérifiez votre connexion et réessayez.");
        }
      } else {
        setError("Une erreur est survenue. Vérifiez votre connexion internet.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">

      {/* === EN-TÊTE AVEC DÉGRADÉ VERT VIVRE === */}
      <header className="bg-gradient-to-b from-green-800 to-green-700 px-6 pt-16 pb-12 text-white text-center">
        {/* Logo VIVRE */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
          <span className="text-3xl font-bold font-sora">V</span>
        </div>
        <h1 className="text-3xl font-bold font-sora mb-1">VIVRE</h1>
        <p className="text-green-200 text-sm">Voyager. Manger. Découvrir.</p>
      </header>

      {/* === FORMULAIRE === */}
      <main className="flex-1 px-6 pt-8 pb-6 flex flex-col">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Bienvenue !
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            Entrez votre numéro de téléphone pour recevoir un code de connexion par SMS.
          </p>

          {/* DEV MODE BANNER */}
          {process.env.NODE_ENV !== "production" && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">Mode développement</p>
              <p>Entrez n&apos;importe quel numéro (ex: <strong>70000000</strong> pour BF ou <strong>+12025550001</strong> pour US).</p>
              <p className="mt-1">Le code OTP apparaîtra directement dans la réponse — pas de SMS réel.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">

            {/* --- Champ téléphone --- */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Numéro de téléphone
              </label>

              {/* Conteneur avec indicatif pays */}
              <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-100 transition-all">
                {/* Indicatif +226 Burkina Faso */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-r border-gray-300 shrink-0">
                  <span className="text-lg leading-none">🇧🇫</span>
                  <span className="text-sm font-medium text-gray-700">+226</span>
                </div>

                {/* Input — accepts local 8-digit or full international number */}
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="70 00 00 00"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d\s\-+]/g, "");
                    setPhone(val);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-3 text-gray-900 placeholder-gray-400 bg-white outline-none text-lg"
                  disabled={isLoading}
                  aria-describedby={error ? "phone-error" : undefined}
                />
              </div>

              {/* Message d'erreur */}
              {error && (
                <p
                  id="phone-error"
                  className="mt-2 text-sm text-red-600 flex items-start gap-1"
                  role="alert"
                >
                  <span aria-hidden>⚠️</span>
                  {error}
                </p>
              )}
            </div>

            {/* Espaceur pour pousser le bouton vers le bas sur grand écran */}
            <div className="flex-1" />

            {/* --- Bouton Envoyer --- */}
            <button
              type="submit"
              disabled={isLoading || !phone.trim()}
              className={[
                "w-full py-4 rounded-xl text-white font-semibold text-base",
                "transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                isLoading || !phone.trim()
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm",
              ].join(" ")}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  {/* Spinner SVG léger */}
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Envoi en cours…
                </span>
              ) : (
                "Recevoir le code SMS"
              )}
            </button>

            {/* Mention légale */}
            <p className="text-center text-xs text-gray-400 mt-2 px-4">
              En continuant, vous acceptez nos{" "}
              <a href="/terms" className="text-green-700 underline">
                Conditions d&apos;utilisation
              </a>{" "}
              et notre{" "}
              <a href="/privacy" className="text-green-700 underline">
                Politique de confidentialité
              </a>.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
