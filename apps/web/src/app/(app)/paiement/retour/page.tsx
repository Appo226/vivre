"use client";

export const dynamic = "force-dynamic";

/**
 * paiement/retour/page.tsx — Page de retour après paiement CinetPay
 *
 * CinetPay redirige le client ici après qu'il a payé (succès ou échec).
 * L'URL contient ?payment_id=xxx — on poll GET /payments/:id/status
 * toutes les 2 secondes jusqu'à obtenir "completed" ou "failed".
 *
 * POURQUOI POLLER :
 *   CinetPay peut rediriger le client avant d'envoyer le webhook IPN.
 *   Le paiement peut donc être encore "pending" à l'arrivée sur cette page.
 *   On poll jusqu'à 30 secondes — au-delà on affiche un message d'attente.
 *
 * Navigation post-paiement :
 *   - food      → /food/mes-commandes/:booking_id
 *   - property  → /hebergement/mes-reservations/:booking_id
 *   - transport → /transport/mes-billets/:booking_id
 *   - event     → /evenements/mes-billets/:booking_id
 */

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface PaymentStatus {
  id:             string;
  status:         string;   /* pending | completed | failed */
  amount:         number;
  payment_method: string;
  booking_type:   string;
  booking_id:     string;
  paid_at:        string | null;
  failed_at:      string | null;
  failure_reason: string | null;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

/* Délai entre deux polls en ms */
const POLL_INTERVAL_MS = 2_000;

/* Nombre maximum de tentatives avant d'afficher "en cours de traitement" */
const MAX_POLLS = 15; /* 15 × 2s = 30 secondes */

/* Labels des méthodes de paiement pour l'affichage */
const METHOD_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov:          "Moov Money",
  telecel_money: "Telecel Money",
  wallet:        "Portefeuille VIVRE",
};

/* URL de destination selon le type de réservation */
function getSuccessUrl(bookingType: string, bookingId: string): string {
  switch (bookingType) {
    case "food":      return `/food/mes-commandes/${bookingId}`;
    case "property":  return `/hebergement/mes-reservations/${bookingId}`;
    case "transport": return `/transport/mes-billets/${bookingId}`;
    case "event":     return `/evenements/mes-billets/${bookingId}`;
    default:          return "/";
  }
}

/* ============================================================
 * COMPOSANT INTERNE (useSearchParams requiert Suspense)
 * ============================================================ */

function RetourContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();

  const paymentId = searchParams.get("payment_id");

  const [payment, setPayment]     = useState<PaymentStatus | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [error, setError]         = useState<string | null>(null);

  /* --------------------------------------------------------
   * Polling du statut de paiement
   * S'arrête dès que le statut est terminal (completed | failed)
   * ou après MAX_POLLS tentatives.
   * -------------------------------------------------------- */
  const pollStatus = useCallback(async () => {
    if (!paymentId || !accessToken) return;

    try {
      const data = await apiClient.get<PaymentStatus>(`/payments/${paymentId}/status`);
      setPayment(data);

      /* Statut terminal → arrêter le polling */
      if (data.status === "completed" || data.status === "failed") return;
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }

    setPollCount((c) => c + 1);
  }, [paymentId, accessToken]);

  /* Lancer le polling dès le montage, puis toutes les POLL_INTERVAL_MS */
  useEffect(() => {
    if (!paymentId) {
      setError("Identifiant de paiement manquant dans l'URL.");
      return;
    }
    if (!accessToken) {
      router.push("/auth");
      return;
    }

    /* Premier appel immédiat */
    void pollStatus();
  }, [paymentId, accessToken, router, pollStatus]);

  useEffect(() => {
    /* Arrêter si statut terminal ou max polls atteint */
    if (!payment || payment.status === "completed" || payment.status === "failed") return;
    if (pollCount >= MAX_POLLS) return;

    const t = setTimeout(() => void pollStatus(), POLL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [pollCount, payment, pollStatus]);

  /* Auto-redirect vers la commande après succès (2 secondes) */
  useEffect(() => {
    if (!payment || payment.status !== "completed") return;
    const t = setTimeout(() => {
      router.push(getSuccessUrl(payment.booking_type, payment.booking_id));
    }, 2_500);
    return () => clearTimeout(t);
  }, [payment, router]);

  /* ============================================================
   * RENDER : erreur d'URL
   * ============================================================ */
  if (!paymentId || error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <p className="text-5xl mb-4">⚠️</p>
          <h1 className="font-bold text-gray-900 text-xl mb-2">Paiement introuvable</h1>
          <p className="text-gray-500 text-sm">{error ?? "Lien de paiement invalide."}</p>
          <Link href="/" className="mt-6 inline-block bg-orange-500 text-white px-6 py-2.5 rounded-xl font-semibold">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER : polling en cours (statut encore pending)
   * ============================================================ */
  if (!payment || payment.status === "pending") {
    const isTimeout = pollCount >= MAX_POLLS;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4 animate-pulse">⏳</div>
          <h1 className="font-bold text-gray-900 text-xl mb-2">
            {isTimeout ? "Traitement en cours…" : "Vérification du paiement…"}
          </h1>
          <p className="text-gray-500 text-sm">
            {isTimeout
              ? "Votre paiement est en cours de traitement. Vous recevrez une confirmation dans quelques minutes."
              : "Patientez quelques secondes pendant que nous confirmons votre paiement."}
          </p>
          {!isTimeout && (
            <div className="mt-6 flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
          {isTimeout && (
            <Link
              href={getSuccessUrl(payment?.booking_type ?? "food", payment?.booking_id ?? "")}
              className="mt-6 inline-block bg-orange-500 text-white px-6 py-2.5 rounded-xl font-semibold"
            >
              Voir ma commande
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER : succès
   * ============================================================ */
  if (payment.status === "completed") {
    const methodLabel = METHOD_LABELS[payment.payment_method] ?? payment.payment_method;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="font-bold text-gray-900 text-2xl mb-1">Paiement validé !</h1>
          <p className="text-gray-500 text-sm mb-6">
            {payment.amount.toLocaleString()} FCFA payés via {methodLabel}
          </p>

          <div className="bg-green-50 rounded-xl p-4 text-left space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500">Montant</span>
              <span className="font-semibold">{payment.amount.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Méthode</span>
              <span className="font-semibold">{methodLabel}</span>
            </div>
            {payment.paid_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-semibold">
                  {new Date(payment.paid_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mb-4">Redirection automatique dans 2 secondes…</p>

          <Link
            href={getSuccessUrl(payment.booking_type, payment.booking_id)}
            className="block w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600 transition-colors"
          >
            Voir ma commande →
          </Link>
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER : échec
   * ============================================================ */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">❌</span>
        </div>
        <h1 className="font-bold text-gray-900 text-2xl mb-1">Paiement échoué</h1>
        <p className="text-gray-500 text-sm mb-6">
          {payment.failure_reason ?? "Le paiement n'a pas pu être traité. Aucun montant n'a été débité."}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.back()}
            className="block w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600 transition-colors"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="block w-full border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE — Suspense requis pour useSearchParams() en App Router
 * ============================================================ */
export default function PaiementRetourPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-4xl animate-pulse">⏳</div>
        </div>
      }
    >
      <RetourContent />
    </Suspense>
  );
}
