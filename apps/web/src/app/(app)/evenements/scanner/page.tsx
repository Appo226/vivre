"use client";

export const dynamic = "force-dynamic";

/**
 * evenements/scanner/page.tsx — EV_SCAN : Scanner de billets à l'entrée
 *
 * Remplace les scanneurs matériels par une simple page web ouverte sur n'importe
 * quel smartphone Android/iOS. L'organisateur partage cette URL à son staff.
 *
 * Flux de scan :
 *   1. Le staff ouvre cette page sur son téléphone (authentifié)
 *   2. La caméra arrière s'active automatiquement et décode le QR en direct
 *      (jsQR — décodage pur JS, gratuit, fonctionne y compris sur Safari/iOS,
 *      contrairement à l'API native BarcodeDetector limitée à Chrome/Android).
 *      Repli manuel (coller le contenu ou l'ID) si la caméra est indisponible.
 *   3. L'API vérifie le billet → retourne valid: true/false avec détails
 *   4. Affichage clair ✅ VALIDE ou ❌ REFUSÉ avec info du détenteur
 *
 * Sécurité : seul l'organisateur de l'événement ou un admin peut scanner.
 * L'API vérifie cela côté serveur.
 *
 * IMPORTANT : cette page est intentionnellement simple — optimisée pour
 * une utilisation rapide debout à l'entrée d'un événement, une main dans la poche.
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";
import { QrCameraScanner } from "@/components/QrCameraScanner";

/* ============================================================
 * TYPES
 * ============================================================ */

interface ScanResult {
  valid: boolean;
  ticket_id?: string;
  event_title?: string;
  ticket_type?: string;
  ticket_number?: number;
  ticket_count?: number;
  seat_number?: number | null;
  holder?: { name: string; phone: string };
  checked_in_at?: string;
  error?: string;
  code?: string;
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function ScannerPage(): React.ReactElement | null {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useEffect(() => { if (!accessToken) { router.push("/auth?redirect=/evenements/scanner"); } }, [accessToken, router]);

  const [bookingId, setBookingId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0); /* Compteur de scans de la session */
  const [manualMode, setManualMode] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scanningRef = useRef(false); /* Verrou anti-double-déclenchement pendant la boucle caméra */

  /**
   * Décoder le contenu brut d'un QR code scanné par l'app native du téléphone.
   * Le QR contient un JSON base64 encodé par l'API — { tk: ticketId, ... } pour un billet
   * individuel (format actuel), ou { b: bookingId, ... } pour un billet émis avant
   * l'introduction des billets individuels (voir migration event_tickets) — le repli legacy
   * de /events/tickets/[id]/scan sait résoudre ce second format. Si le contenu est déjà un
   * UUID, on l'utilise directement (saisie manuelle par le staff).
   */
  function parseQrContent(raw: string): string {
    const trimmed = raw.trim();
    /* UUID direct — le staff a collé l'ID manuellement */
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;

    /* Contenu base64 encodé par l'API (format QR code VIVRE) */
    try {
      const decoded = atob(trimmed);
      const data = JSON.parse(decoded) as { tk?: string; b?: string };
      if (data.tk) return data.tk;
      if (data.b) return data.b;
    } catch {
      /* Pas du base64 valide — utiliser la valeur brute */
    }

    return trimmed;
  }

  async function handleScan(raw: string): Promise<void> {
    const parsed = parseQrContent(raw);
    if (!parsed || scanningRef.current) return;
    scanningRef.current = true;

    setIsScanning(true);
    setResult(null);

    try {
      const response = await apiClient.post<ScanResult>(
        `/events/tickets/${parsed}/scan`,
        {}
      );
      setResult(response);
      setScanCount((c) => c + 1);

      /* Vibrer pour feedback tactile (si supporté) */
      if (navigator.vibrate) {
        navigator.vibrate(response.valid ? [100, 50, 100] : [500]);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({ valid: false, error: err.message, code: err.code });
      } else {
        setResult({ valid: false, error: "Erreur réseau, vérifiez votre connexion" });
      }
    } finally {
      setIsScanning(false);
    }
  }

  function handleReset(): void {
    setResult(null);
    setBookingId("");
    scanningRef.current = false;
    /* Remettre le focus sur la textarea pour le prochain scan manuel */
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  /* Rediriger si non authentifié — après tous les hooks, jamais avant (Rules of Hooks) */
  if (!accessToken) return null;

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex flex-col">
      {/* En-tête — design sombre pour une meilleure lisibilité en plein air */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-white font-bold text-lg">Scanner de billets</h1>
          <p className="text-white/60 text-xs">
            {scanCount > 0 ? `${scanCount} billet${scanCount > 1 ? "s" : ""} scanné${scanCount > 1 ? "s" : ""}` : "Pointez la caméra vers le QR code du billet"}
          </p>
        </div>
      </div>

      {/* Zone principale */}
      <div className="flex-1 px-4 py-4 space-y-4">

        {/* Scan par caméra — mode principal */}
        {!result && !manualMode && (
          <div className="space-y-3">
            <QrCameraScanner paused={isScanning} onDetect={(raw) => void handleScan(raw)} />
            <p className="text-white/50 text-xs text-center">Placez le QR code du billet dans le cadre</p>
            <button
              onClick={() => setManualMode(true)}
              className="w-full text-white/60 text-sm py-2 underline"
            >
              Saisie manuelle à la place
            </button>
          </div>
        )}

        {/* Saisie manuelle — repli si la caméra est indisponible ou refusée */}
        {!result && manualMode && (
          <div className="bg-white/10 rounded-2xl p-5">
            <p className="text-white/80 text-sm mb-3">
              Collez le contenu décodé du QR, ou saisissez directement l&apos;ID de réservation.
            </p>
            <textarea
              ref={inputRef}
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="Collez le contenu du QR ou l'ID de réservation..."
              className="w-full bg-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white/30 resize-none h-20"
              autoFocus
              onKeyDown={(e) => {
                /* Valider avec Entrée (sans Shift) */
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleScan(bookingId);
                }
              }}
            />
            <button
              onClick={() => void handleScan(bookingId)}
              disabled={!bookingId.trim() || isScanning}
              className="w-full mt-3 bg-[#1A6B3A] text-white font-bold py-4 rounded-xl text-lg disabled:opacity-40 transition-all active:scale-95"
            >
              {isScanning ? "Vérification..." : "Valider le billet"}
            </button>
            <button
              onClick={() => setManualMode(false)}
              className="w-full text-white/60 text-sm py-2 mt-1 underline"
            >
              Revenir au scan caméra
            </button>
          </div>
        )}

        {/* Résultat du scan */}
        {result && (
          <div className={`rounded-2xl p-6 text-center ${
            result.valid ? "bg-green-500" : "bg-red-500"
          }`}>
            {/* Icône résultat — grande, visible de loin */}
            <div className="text-8xl mb-4">
              {result.valid ? "✅" : "❌"}
            </div>

            <p className="text-white font-bold text-2xl mb-2">
              {result.valid ? "VALIDE" : "REFUSÉ"}
            </p>

            {result.valid && result.seat_number != null && (
              <p className="text-white font-sora font-extrabold text-3xl mb-2">
                Place {result.seat_number}
              </p>
            )}

            {result.valid ? (
              /* Détails du billet valide */
              <div className="bg-white/20 rounded-xl p-4 mt-3 text-left space-y-2">
                <DetailRow label="Événement" value={result.event_title ?? "\u2014"} />
                <DetailRow label="Type" value={result.ticket_type ?? "\u2014"} />
                {result.ticket_count && result.ticket_count > 1 && (
                  <DetailRow label="Billet" value={`${result.ticket_number} / ${result.ticket_count}`} />
                )}
                {result.holder && (
                  <>
                    <DetailRow label="Détenteur" value={result.holder.name} />
                    <DetailRow label="Téléphone" value={result.holder.phone} />
                  </>
                )}
              </div>
            ) : (
              /* Message d'erreur */
              <p className="text-white/90 text-base mt-2">
                {result.error ?? "Billet invalide"}
              </p>
            )}

            {/* Bouton scanner suivant */}
            <button
              onClick={handleReset}
              className="mt-5 w-full bg-white/20 text-white font-semibold py-4 rounded-xl text-lg active:scale-95 transition-all"
            >
              Scanner suivant →
            </button>
          </div>
        )}

        {/* Instructions rapides */}
        {!result && !manualMode && (
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2">
              Instructions
            </p>
            <Step n="1" text="Autorisez l'accès à la caméra si demandé" />
            <Step n="2" text="Cadrez le QR code affiché sur le téléphone du client" />
            <Step n="3" text="Résultat automatique dès la détection, pas de bouton à presser" />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between items-start">
      <span className="text-white/70 text-sm">{label}</span>
      <span className="text-white font-semibold text-sm text-right ml-2">{value}</span>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
        {n}
      </span>
      <p className="text-white/70 text-sm">{text}</p>
    </div>
  );
}
