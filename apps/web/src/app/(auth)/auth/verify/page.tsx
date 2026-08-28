/**
 * app/(auth)/auth/verify/page.tsx — Vérification du numéro de téléphone (post-inscription)
 *
 * Authentifié : appelé juste après /auth/register, qui a déjà stocké les tokens. Le
 * téléphone vient du compte connecté, jamais d'un query param — voir /api/auth/verify-phone.
 * Non bloquant pour naviguer (bouton "Plus tard") : is_verified n'est exigé qu'au moment
 * de réserver un billet (voir le gate dans events/bookings), pas pour utiliser l'app.
 */

"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

const OTP_DURATION = 300;

interface VerifyPhoneResponse {
  message: string;
  is_verified: boolean;
}

interface SendResponse {
  message: string;
  expires_in?: number;
  dev_code?: string;
  is_verified?: boolean;
}

function VerifyPhoneContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "";
  const initialDevCode = searchParams.get("dev_code") ?? "";

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const phone = user?.phone ?? "";

  const [digits, setDigits] = useState<string[]>(
    initialDevCode.length === 6 ? initialDevCode.split("") : ["", "", "", "", "", ""]
  );
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [secondsLeft, setSecondsLeft] = useState(OTP_DURATION);
  const [canResend, setCanResend] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleDigitChange = (index: number, value: string): void => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent): void => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent): void => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(newDigits);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const goNext = useCallback((): void => {
    router.push(redirect.startsWith("/") ? redirect : "/");
  }, [redirect, router]);

  const handleVerify = useCallback(async (): Promise<void> => {
    const code = digits.join("");
    if (code.length !== 6) return;

    setIsVerifying(true);
    setError(null);

    try {
      await apiClient.post<VerifyPhoneResponse>("/auth/verify-phone", { code });
      if (user) setUser({ ...user, is_verified: true });
      setVerified(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "OTP_INVALID") setError(err.message);
        else if (err.code === "VERIFY_ATTEMPTS_EXCEEDED") {
          setError(err.message);
          setCanResend(true);
        } else setError("Une erreur est survenue. Réessayez.");
      } else {
        setError("Vérifiez votre connexion internet et réessayez.");
      }
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  }, [digits, user, setUser]);

  useEffect(() => {
    if (digits.every((d) => d !== "") && digits.join("").length === 6 && !verified) {
      void handleVerify();
    }
  }, [digits, handleVerify, verified]);

  const handleResend = async (): Promise<void> => {
    setIsResending(true);
    setError(null);
    try {
      const res = await apiClient.post<SendResponse>("/auth/verify-phone/send", {});
      if (res.is_verified) {
        setVerified(true);
        return;
      }
      setSecondsLeft(OTP_DURATION);
      setCanResend(false);
      setDigits(res.dev_code?.length === 6 ? res.dev_code.split("") : ["", "", "", "", "", ""]);
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

  const maskedPhone = phone.replace(/(\+226)(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 ** **");

  if (verified) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-3xl mb-4">
          ✓
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Numéro vérifié</h1>
        <p className="text-gray-500 text-sm mb-6">Votre compte est prêt à réserver des billets.</p>
        <button
          onClick={goNext}
          className="w-full max-w-xs py-4 rounded-xl text-white font-semibold text-base bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm transition-all"
        >
          Continuer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gradient-to-b from-green-800 to-green-700 px-6 pt-14 pb-10 text-white">
        <h1 className="text-2xl font-bold mb-1">Vérifiez votre numéro</h1>
        <p className="text-green-200 text-sm">Code envoyé au {maskedPhone || "votre numéro"}</p>
      </header>

      <main className="flex-1 px-6 pt-8 pb-6 flex flex-col">
        <div className="max-w-sm mx-auto w-full flex flex-col flex-1">
          <div className="mb-6 text-center">
            {secondsLeft > 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-2">Code valable encore</p>
                <span className="text-3xl font-bold font-mono text-green-700">{formatTime(secondsLeft)}</span>
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-1000"
                    style={{ width: `${(secondsLeft / OTP_DURATION) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-red-500 font-medium">Code expiré — renvoyez-en un nouveau</p>
            )}
          </div>

          <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
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
                  digit ? "border-green-600 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-900",
                  "focus:border-green-600 focus:bg-green-50/50",
                  isVerifying ? "opacity-50" : "",
                ].join(" ")}
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-sm text-red-600 mb-4" role="alert">
              {error}
            </p>
          )}

          {isVerifying && (
            <div className="flex justify-center mb-4">
              <svg className="animate-spin h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          <div className="flex-1" />

          <div className="text-center mt-4">
            <p className="text-sm text-gray-500 mb-2">Vous n&apos;avez pas reçu le SMS ?</p>
            <button
              onClick={handleResend}
              disabled={!canResend || isResending || isVerifying}
              className={[
                "text-sm font-semibold transition-colors",
                canResend && !isResending ? "text-green-700 hover:text-green-800 underline" : "text-gray-300 cursor-not-allowed",
              ].join(" ")}
            >
              {isResending ? "Envoi en cours…" : "Renvoyer le code"}
            </button>
          </div>

          <button
            onClick={goNext}
            className="text-center text-sm text-gray-400 hover:text-gray-600 mt-6 underline"
          >
            Plus tard — je vérifierai avant de réserver
          </button>
        </div>
      </main>
    </div>
  );
}

export default function VerifyPhonePage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyPhoneContent />
    </Suspense>
  );
}
