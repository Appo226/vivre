"use client";

export const dynamic = "force-dynamic";

/**
 * app/transfert/[token]/page.tsx — Atterrissage du lien magique SMS de transfert de billet.
 *
 * Doit fonctionner pour quelqu'un qui n'a AUCUN compte VIVRE, avec zéro friction : pas de
 * mot de passe à créer, juste le code reçu par le même SMS (voir /api/auth/send-otp et
 * verify-otp — déjà le mécanisme de connexion existant, réutilisé tel quel). Le billet a déjà
 * changé de détenteur côté serveur au moment du transfert (voir PATCH
 * /events/tickets/[id]/transfer) — cette page ne fait qu'authentifier la bonne personne pour
 * qu'elle puisse ensuite le voir sur /evenements/mes-billets/[id], jamais de logique de
 * transfert ici.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { VivreLogo } from "@/components/VivreLogo";

interface TransferPreview {
  ticket_id: string;
  booking_id: string;
  recipient_phone: string;
  sender_name: string | null;
  event: { title: string; cover_url: string | null; starts_at: string; venue_name: string };
}

interface SendOtpResponse {
  message: string;
  expires_in: number;
  dev_code?: string;
}

interface VerifyOtpResponse {
  access_token: string;
  refresh_token: string;
  is_new_user: boolean;
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

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

export default function TransferLandingPage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [otpSent, setOtpSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    apiClient
      .get<TransferPreview>(`/transfers/${token}`)
      .then(setPreview)
      .catch((err) => {
        setPreviewError(err instanceof ApiError ? err.message : "Ce lien n'est plus valide.");
      })
      .finally(() => setLoadingPreview(false));
  }, [token]);

  const goToTicket = useCallback(() => {
    if (preview) router.push(`/evenements/mes-billets/${preview.booking_id}`);
  }, [preview, router]);

  // Déjà connecté avec le bon numéro (cas fréquent : destinataire déjà client VIVRE qui
  // ouvre le lien depuis son téléphone déjà logué) — aucune étape supplémentaire, direction
  // le billet. `hasHydrated` évite de rediriger à tort pendant la fenêtre de lecture de
  // localStorage (même piège d'hydratation documenté ailleurs dans ce fichier de store).
  useEffect(() => {
    if (!hasHydrated || !preview) return;
    if (isAuthenticated && authUser?.phone === preview.recipient_phone) {
      goToTicket();
    }
  }, [hasHydrated, isAuthenticated, authUser, preview, goToTicket]);

  async function handleSendOtp(): Promise<void> {
    if (!preview) return;
    setIsSending(true);
    setOtpError(null);
    try {
      const res = await apiClient.post<SendOtpResponse>(
        "/auth/send-otp",
        { phone: preview.recipient_phone },
        { skipAuth: true }
      );
      setOtpSent(true);
      setDigits(res.dev_code?.length === 6 ? res.dev_code.split("") : ["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Impossible d'envoyer le code. Vérifiez votre connexion.");
    } finally {
      setIsSending(false);
    }
  }

  const handleVerify = useCallback(async (): Promise<void> => {
    if (!preview) return;
    const code = digits.join("");
    if (code.length !== 6) return;
    setIsVerifying(true);
    setOtpError(null);
    try {
      const res = await apiClient.post<VerifyOtpResponse>(
        "/auth/verify-otp",
        { phone: preview.recipient_phone, code },
        { skipAuth: true }
      );
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token, user: { ...res.user, is_verified: true } });
      document.cookie = `vivre_auth_token=${res.access_token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      router.push(`/evenements/mes-billets/${preview.booking_id}`);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Code incorrect ou expiré.");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  }, [digits, preview, router, setAuth]);

  useEffect(() => {
    if (digits.every((d) => d !== "") && digits.join("").length === 6) {
      void handleVerify();
    }
  }, [digits, handleVerify]);

  function handleDigitChange(index: number, value: string): void {
    const incoming = value.replace(/\D/g, "");
    if (incoming.length > 1) {
      const newDigits = [...digits];
      for (let i = 0; i < incoming.length && index + i < 6; i++) newDigits[index + i] = incoming[i] ?? "";
      setDigits(newDigits);
      setOtpError(null);
      inputRefs.current[Math.min(index + incoming.length, 5)]?.focus();
      return;
    }
    const digit = incoming.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setOtpError(null);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent): void {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  }

  /* ---- ÉTATS DE CHARGEMENT / ERREUR ---- */
  if (loadingPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-[#1A6B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (previewError || !preview) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-page">
        <span className="text-4xl mb-3" aria-hidden="true">🔗</span>
        <h1 className="text-lg font-bold text-ink mb-1">Lien invalide</h1>
        <p className="text-ink-soft text-sm mb-6">{previewError ?? "Ce lien de transfert n'existe pas ou n'est plus valide."}</p>
        <a href="/auth" className="text-sm font-semibold text-green-700 dark:text-green-300 underline">
          Se connecter à VIVRE
        </a>
      </div>
    );
  }

  /* ---- CONNECTÉ MAIS AVEC UN AUTRE NUMÉRO ---- */
  if (hasHydrated && isAuthenticated && authUser?.phone !== preview.recipient_phone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-page">
        <span className="text-4xl mb-3" aria-hidden="true">🙅</span>
        <h1 className="text-lg font-bold text-ink mb-1">Ce billet n&apos;est pas pour ce compte</h1>
        <p className="text-ink-soft text-sm mb-6">
          Ce transfert est destiné au numéro {preview.recipient_phone}, pas au compte actuellement connecté.
          Déconnectez-vous puis rouvrez ce lien pour l&apos;accepter avec le bon numéro.
        </p>
        <a href="/profile" className="text-sm font-semibold text-green-700 dark:text-green-300 underline">
          Aller au profil
        </a>
      </div>
    );
  }

  /* ---- APERÇU + CONNEXION PAR CODE SMS ---- */
  return (
    <div className="min-h-screen bg-page">
      <header className="hero-texture px-6 pt-14 pb-8 text-center overflow-hidden">
        <VivreLogo size={56} variant="auto" className="mx-auto mb-5" />
        <p className="text-ink-soft text-sm mb-1">
          {preview.sender_name ?? "Quelqu'un"} vous a transféré un billet pour
        </p>
        <h1 className="font-sora text-2xl font-extrabold text-ink text-balance px-2">{preview.event.title}</h1>
      </header>

      <main className="px-6 pt-6 pb-10 max-w-sm mx-auto">
        <div className="bg-surface-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden mb-6">
          {preview.event.cover_url && (
            <Image
              src={preview.event.cover_url}
              alt={preview.event.title}
              width={400}
              height={200}
              className="w-full h-32 object-cover"
              unoptimized
            />
          )}
          <div className="p-4 text-sm text-ink-soft space-y-1">
            <p className="capitalize">{formatEventDate(preview.event.starts_at)}</p>
            <p>{preview.event.venue_name}</p>
          </div>
        </div>

        {!otpSent ? (
          <>
            <p className="text-sm text-ink-soft text-center mb-4">
              Entrez le code envoyé par SMS au {preview.recipient_phone} pour voir votre billet — pas de mot de passe nécessaire.
            </p>
            {otpError && <p className="text-sm text-red-600 text-center mb-3">{otpError}</p>}
            <button
              onClick={() => void handleSendOtp()}
              disabled={isSending}
              className="w-full py-4 rounded-xl text-white font-semibold text-base bg-green-700 hover:bg-green-800 active:scale-[0.98] shadow-sm transition-all disabled:opacity-60"
            >
              {isSending ? "Envoi…" : "Recevoir mon code par SMS"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft text-center mb-4">Code envoyé au {preview.recipient_phone}</p>
            <div className="flex gap-2 justify-center mb-4">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isVerifying}
                  aria-label={`Chiffre ${index + 1} du code`}
                  className={[
                    "w-11 h-13 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-150",
                    digit ? "border-green-600 dark:border-green-500 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" : "border-border-subtle bg-surface-elevated text-ink",
                    isVerifying ? "opacity-50" : "",
                  ].join(" ")}
                />
              ))}
            </div>
            {otpError && <p className="text-sm text-red-600 text-center mb-3">{otpError}</p>}
            {isVerifying && (
              <div className="flex justify-center mb-3">
                <svg className="animate-spin h-5 w-5 text-green-600 dark:text-green-300" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            <button
              onClick={() => void handleSendOtp()}
              disabled={isSending}
              className="w-full text-center text-sm font-semibold text-green-700 dark:text-green-300 underline disabled:opacity-60"
            >
              {isSending ? "Envoi…" : "Renvoyer le code"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
