/**
 * app/(auth)/verify/page.tsx — S-003 : Vérification du code OTP
 *
 * L'utilisateur saisit le code à 6 chiffres reçu par SMS.
 * Fonctionnalités :
 * - Input 6 cases individuelles (UX mobile optimale — focus auto entre cases)
 * - Countdown 5 minutes avec barre de progression verte
 * - Bouton "Renvoyer le code" actif après expiry ou sur demande (rate limit 3/h)
 * - Soumission automatique quand les 6 chiffres sont saisis
 * - Redirection vers profil (nouveaux users) ou hub (users existants)
 *
 * Le numéro de téléphone est passé en query param depuis l'écran précédent.
 * Ex: /auth/verify?phone=%2B22670123456
 */

"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, type VerifyOtpResponse, type SendOtpResponse, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/** Durée de validité du code OTP en secondes */
const OTP_DURATION = 300;

/* Composant interne isolé dans Suspense pour permettre useSearchParams() */
function VerifyOtpContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";

  const setAuth = useAuthStore((s) => s.setAuth);

  /* 6 cases pour le code OTP */
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  /* Countdown */
  const [secondsLeft, setSecondsLeft] = useState(OTP_DURATION);
  const [canResend, setCanResend] = useState(false);

  /* États UI */
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Countdown timer --- */
  useEffect(() => {
    if (secondsLeft <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /* --- Format mm:ss pour l'affichage --- */
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  /* --- Saisie d'un chiffre dans une case --- */
  const handleDigitChange = (index: number, value: string): void => {
    /* Accepter uniquement les chiffres */
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    /* Focus automatique sur la case suivante */
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  /* --- Touche Backspace : effacer et revenir en arrière --- */
  const handleKeyDown = (index: number, e: React.KeyboardEvent): void => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  /* --- Coller un code depuis le presse-papier (ex: depuis un SMS) --- */
  const handlePaste = (e: React.ClipboardEvent): void => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(newDigits);
      /* Focus sur la dernière case remplie */
      const lastFilled = Math.min(pasted.length, 5);
      inputRefs.current[lastFilled]?.focus();
    }
  };

  /* --- Vérification du code OTP --- */
  const handleVerify = useCallback(async (): Promise<void> => {
    const code = digits.join("");
    if (code.length !== 6) return;

    setIsVerifying(true);
    setError(null);

    try {
      const response = await apiClient.post<VerifyOtpResponse>(
        "/auth/verify-otp",
        { phone, code },
        { skipAuth: true }
      );

      /* Stocker les tokens dans le store Zustand */
      setAuth({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: response.user,
      });

      /*
       * Stocker le token dans un cookie pour le middleware Next.js.
       * Le middleware lit le cookie `vivre_auth_token` pour protéger les routes.
       * Expiry 7 jours (même que l'access_token).
       */
      document.cookie = `vivre_auth_token=${response.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;

      /* Redirection selon si c'est un nouvel utilisateur */
      if (response.is_new_user) {
        router.push("/auth/profile-setup");
      } else {
        const redirect = new URLSearchParams(window.location.search).get("redirect");
        router.push(redirect ?? "/");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "OTP_INVALID_CODE") {
          setError("Code incorrect. Vérifiez votre SMS et réessayez.");
        } else if (err.code === "OTP_EXPIRED") {
          setError("Code expiré. Cliquez sur « Renvoyer le code ».");
          setCanResend(true);
        } else if (err.status === 403) {
          setError("Votre compte a été suspendu. Contactez support@vivre.bf");
        } else {
          setError("Une erreur est survenue. Réessayez.");
        }
      } else {
        setError("Vérifiez votre connexion internet et réessayez.");
      }
      /* Vider le code en cas d'erreur */
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  }, [digits, phone, router, setAuth]);

  /* Soumission automatique quand les 6 chiffres sont saisis */
  useEffect(() => {
    if (digits.every((d) => d !== "") && digits.join("").length === 6) {
      void handleVerify();
    }
  }, [digits, handleVerify]);

  /* --- Renvoi du code OTP --- */
  const handleResend = async (): Promise<void> => {
    setIsResending(true);
    setError(null);

    try {
      await apiClient.post<SendOtpResponse>(
        "/auth/send-otp",
        { phone },
        { skipAuth: true }
      );
      setSecondsLeft(OTP_DURATION);
      setCanResend(false);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Vous avez dépassé la limite. Attendez avant de renvoyer.");
      } else {
        setError("Impossible de renvoyer le SMS. Réessayez dans quelques instants.");
      }
    } finally {
      setIsResending(false);
    }
  };

  /* Afficher le numéro masqué (+226 XX XX ** **) */
  const maskedPhone = phone.replace(/(\+226)(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 ** **");

  return (
    <div className="flex flex-col min-h-screen">

      {/* === EN-TÊTE === */}
      <header className="bg-gradient-to-b from-green-800 to-green-700 px-6 pt-14 pb-10 text-white">
        {/* Bouton retour */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-green-200 hover:text-white transition-colors"
          aria-label="Retour"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </button>

        <h1 className="text-2xl font-bold mb-1">Vérification</h1>
        <p className="text-green-200 text-sm">
          Code envoyé au {maskedPhone || "votre numéro"}
        </p>
      </header>

      {/* === CONTENU === */}
      <main className="flex-1 px-6 pt-8 pb-6 flex flex-col">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">

          {/* --- Countdown --- */}
          <div className="mb-6 text-center">
            {secondsLeft > 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-2">
                  Code valable encore
                </p>
                <span className="text-3xl font-bold font-mono text-green-700">
                  {formatTime(secondsLeft)}
                </span>
                {/* Barre de progression */}
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-1000"
                    style={{ width: `${(secondsLeft / OTP_DURATION) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-red-500 font-medium">
                Code expiré — renvoyez-en un nouveau
              </p>
            )}
          </div>

          {/* --- 6 cases de saisie OTP --- */}
          <div
            className="flex gap-2 justify-center mb-4"
            onPaste={handlePaste}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={isVerifying}
                aria-label={`Chiffre ${index + 1} du code`}
                className={[
                  "w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 outline-none",
                  "transition-all duration-150",
                  digit
                    ? "border-green-600 bg-green-50 text-green-700"
                    : "border-gray-200 bg-gray-50 text-gray-900",
                  "focus:border-green-600 focus:bg-green-50/50",
                  isVerifying ? "opacity-50" : "",
                ].join(" ")}
              />
            ))}
          </div>

          {/* --- Message d'erreur --- */}
          {error && (
            <p className="text-center text-sm text-red-600 mb-4" role="alert">
              {error}
            </p>
          )}

          {/* --- Spinner pendant la vérification --- */}
          {isVerifying && (
            <div className="flex justify-center mb-4">
              <svg className="animate-spin h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}

          <div className="flex-1" />

          {/* --- Bouton Renvoyer --- */}
          <div className="text-center mt-4">
            <p className="text-sm text-gray-500 mb-2">Vous n&apos;avez pas reçu le SMS ?</p>
            <button
              onClick={handleResend}
              disabled={!canResend || isResending || isVerifying}
              className={[
                "text-sm font-semibold transition-colors",
                canResend && !isResending
                  ? "text-green-700 hover:text-green-800 underline"
                  : "text-gray-300 cursor-not-allowed",
              ].join(" ")}
            >
              {isResending ? "Envoi en cours…" : "Renvoyer le code"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* Wrapper avec Suspense — obligatoire pour useSearchParams() en Next.js 14 */
export default function VerifyOtpPage(): React.ReactElement {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyOtpContent />
    </Suspense>
  );
}
