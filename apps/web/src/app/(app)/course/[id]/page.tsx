"use client";

export const dynamic = "force-dynamic";

/**
 * course/[id]/page.tsx — Suivi de course en temps réel (client)
 *
 * Se connecte au SSE GET /rides/:id/stream et reçoit :
 *   "connected"       : SSE connecté
 *   "driver_accepted" : chauffeur assigné — afficher infos du chauffeur
 *   "driver_location" : position GPS du chauffeur (mise à jour toutes les 5s)
 *   "status_changed"  : changement de statut (arrived, in_progress…)
 *   "completed"       : course terminée — afficher bouton paiement
 *   "cancelled"       : annulée (timeout ou annulation) — retour à l'accueil
 *
 * UI sans carte (MVP) : affichage des adresses + carte de statut animée.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface DriverInfo {
  id:            string;
  name:          string;
  phone:         string;
  vehicle_type:  string | null;
  vehicle_plate: string | null;
  driver_type:   string;
  rating_avg:    number;
}

interface DriverLocation {
  lat:       number;
  lng:       number;
  timestamp: string;
}

interface Ride {
  id:              string;
  status:          string;
  pickup_address:  string | null;
  dropoff_address: string | null;
  ride_type:       string;
  estimated_price: number;
  final_price:     number | null;
  payment_method:  string;
}

/* ============================================================
 * CONFIGURATION DES STATUTS
 * ============================================================ */

const STATUS_CONFIG: Record<string, { label: string; emoji: string; description: string; color: string }> = {
  searching:   { label: "Recherche",   emoji: "🔍", description: "Recherche d'un chauffeur disponible…",         color: "text-blue-600" },
  accepted:    { label: "En route",    emoji: "🛵", description: "Votre chauffeur est en route vers vous",        color: "text-orange-600" },
  arrived:     { label: "Arrivé",      emoji: "📍", description: "Votre chauffeur vous attend au point de départ", color: "text-green-600" },
  in_progress: { label: "En cours",   emoji: "🚀", description: "Bonne route !",                                  color: "text-purple-600" },
  completed:   { label: "Terminée",   emoji: "✅", description: "Course terminée — merci d'avoir utilisé VIVRE",  color: "text-green-600" },
  cancelled:   { label: "Annulée",    emoji: "❌", description: "Course annulée",                                  color: "text-red-600" },
};

const METHOD_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov:          "Moov Money",
  telecel_money: "Telecel Money",
};

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function RideTrackingPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const router         = useRouter();
  const { accessToken } = useAuthStore();

  const [ride,           setRide]           = useState<Ride | null>(null);
  const [driver,         setDriver]         = useState<DriverInfo | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [status,         setStatus]         = useState<string>("searching");
  const [message,        setMessage]        = useState<string>("");
  const [loading,        setLoading]        = useState(true);
  const [cancelling,     setCancelling]     = useState(false);
  const [showPayment,    setShowPayment]    = useState(false);
  const [finalPrice,     setFinalPrice]     = useState<number | null>(null);
  const [showRating,     setShowRating]     = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  /* Charger les données initiales de la course */
  useEffect(() => {
    if (!accessToken) {
      router.push(`/auth?redirect=/course/${params.id}`);
      return;
    }

    apiClient
      .get<{ ride: Ride }>(`/rides/${params.id}`)
      .then((res) => {
        setRide(res.ride);
        setStatus(res.ride.status);
      })
      .catch(() => router.push("/course"))
      .finally(() => setLoading(false));
  }, [params.id, accessToken, router]);

  /* Connexion SSE */
  useEffect(() => {
    if (!accessToken || loading) return;

    const BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";
    const url      = `${BASE_URL}/rides/${params.id}/stream`;

    const source = new EventSource(url, { withCredentials: false });
    eventSourceRef.current = source;

    source.addEventListener("connected", () => {
      /* SSE connecté — rien à faire */
    });

    source.addEventListener("driver_accepted", (e) => {
      const data = JSON.parse(e.data) as { driver: DriverInfo };
      setDriver(data.driver);
      setStatus("accepted");
      setMessage(`${data.driver.name} est en route vers vous`);
    });

    source.addEventListener("driver_location", (e) => {
      const data = JSON.parse(e.data) as DriverLocation;
      setDriverLocation(data);
    });

    source.addEventListener("status_changed", (e) => {
      const data = JSON.parse(e.data) as { status: string; message?: string };
      setStatus(data.status);
      if (data.message) setMessage(data.message);
    });

    source.addEventListener("completed", (e) => {
      const data = JSON.parse(e.data) as { final_price: number; payment_method: string };
      setStatus("completed");
      setFinalPrice(data.final_price);
      setShowPayment(true);
      source.close();
    });

    source.addEventListener("cancelled", (e) => {
      const data = JSON.parse(e.data) as { reason: string };
      setStatus("cancelled");
      setMessage(data.reason);
      source.close();
    });

    source.onerror = () => {
      /* Reconnexion automatique gérée par EventSource — pas d'action nécessaire */
    };

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [params.id, accessToken, loading]);

  async function handleCancel(): Promise<void> {
    setCancelling(true);
    try {
      await apiClient.post(`/rides/${params.id}/cancel`, {});
      setStatus("cancelled");
      setMessage("Vous avez annulé la course");
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG["searching"]!;
  const isTerminal   = status === "completed" || status === "cancelled";

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* En-tête */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/course")}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-bold text-gray-900">Suivi de course</h1>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Carte de statut principal */}
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center">
          <div className="text-6xl mb-3">{statusConfig.emoji}</div>
          <p className={`text-xl font-bold ${statusConfig.color}`}>{statusConfig.label}</p>
          <p className="text-sm text-gray-500 mt-1">{message || statusConfig.description}</p>

          {/* Animation de recherche */}
          {status === "searching" && (
            <div className="flex justify-center gap-1 mt-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Itinéraire */}
        {ride && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-green-600 text-xs font-bold">A</span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Départ</p>
                <p className="text-sm font-medium text-gray-900">
                  {ride.pickup_address ?? "Position actuelle"}
                </p>
              </div>
            </div>
            <div className="ml-3.5 h-4 border-l-2 border-dashed border-gray-200" />
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-red-500 text-xs font-bold">B</span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Arrivée</p>
                <p className="text-sm font-medium text-gray-900">
                  {ride.dropoff_address ?? "Destination"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Carte chauffeur (visible après acceptation) */}
        {driver && !isTerminal && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Votre chauffeur</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-3xl flex-shrink-0">
                {driver.driver_type === "taxi" ? "🚕" : "🛵"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{driver.name}</p>
                <p className="text-sm text-gray-500">
                  {driver.vehicle_type ?? driver.driver_type}
                  {driver.vehicle_plate ? ` · ${driver.vehicle_plate}` : ""}
                </p>
                <p className="text-xs text-orange-500 font-semibold mt-0.5">
                  ★ {driver.rating_avg.toFixed(1)}
                </p>
              </div>
              <a
                href={`tel:${driver.phone}`}
                className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              </a>
            </div>

            {/* Position du chauffeur */}
            {driverLocation && (
              <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-400">
                Dernière position : {new Date(driverLocation.timestamp).toLocaleTimeString("fr-FR")}
              </div>
            )}
          </div>
        )}

        {/* Tarif */}
        {ride && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400">Prix estimé</p>
              <p className="text-xl font-bold text-orange-600">
                {(finalPrice ?? ride.estimated_price).toLocaleString()} FCFA
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Via</p>
              <p className="text-sm font-semibold text-gray-700">
                {METHOD_LABELS[ride.payment_method] ?? ride.payment_method}
              </p>
            </div>
          </div>
        )}

        {/* Bouton annuler (disponible pendant searching et accepted) */}
        {(status === "searching" || status === "accepted") && (
          <button
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className="w-full bg-red-50 border border-red-200 text-red-600 font-semibold py-3.5 rounded-2xl text-sm active:scale-95 transition-all disabled:opacity-50"
          >
            {cancelling ? "Annulation…" : "Annuler la course"}
          </button>
        )}

        {/* Bouton retour (courses terminées) */}
        {isTerminal && !showPayment && (
          <button
            onClick={() => router.push("/course")}
            className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl"
          >
            Nouvelle course
          </button>
        )}
      </div>

      {/* Modal paiement à la fin de la course */}
      {showPayment && ride && finalPrice !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <div className="text-center">
              <p className="text-5xl mb-2">💳</p>
              <h2 className="text-xl font-bold text-gray-900">Payer votre course</h2>
              <p className="text-3xl font-bold text-orange-600 mt-2">
                {finalPrice.toLocaleString()} FCFA
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Via {METHOD_LABELS[ride.payment_method] ?? ride.payment_method}
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Départ</span>
                <span className="font-medium text-right max-w-[200px] truncate">
                  {ride.pickup_address ?? "Position actuelle"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Arrivée</span>
                <span className="font-medium text-right max-w-[200px] truncate">
                  {ride.dropoff_address ?? "Destination"}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-orange-600">{finalPrice.toLocaleString()} FCFA</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Vous allez recevoir une demande de paiement sur votre téléphone {METHOD_LABELS[ride.payment_method] ?? ride.payment_method}
            </p>

            <button
              onClick={() => {
                /* TODO: Intégrer CinetPay Checkout — même pattern que /payments */
                setShowPayment(false);
                if (driver) setShowRating(true);
                else router.push("/course");
              }}
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl text-base active:scale-95 transition-all"
            >
              Confirmer le paiement
            </button>
          </div>
        </div>
      )}

      {/* Modal notation du chauffeur */}
      {showRating && driver && (
        <DriverRatingModal
          rideId={params.id}
          driver={driver}
          onClose={() => { setShowRating(false); router.push("/course"); }}
        />
      )}
    </div>
  );
}

/* ============================================================
 * DRIVER RATING MODAL
 * ============================================================ */

function DriverRatingModal({
  rideId,
  driver,
  onClose,
}: {
  rideId:  string;
  driver:  DriverInfo;
  onClose: () => void;
}): React.ReactElement {
  const [rating,     setRating]     = useState(0);
  const [hovered,    setHovered]    = useState(0);
  const [comment,    setComment]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await apiClient.post("/reviews", {
        entity_type:    "driver",
        entity_id:      driver.id,
        rating,
        booking_ref_id: rideId,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [rating, comment, driver.id, rideId, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 space-y-5">
        {submitted ? (
          <div className="text-center py-4">
            <p className="text-4xl mb-2">🙏</p>
            <p className="font-bold text-gray-900">Merci pour votre avis !</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mx-auto mb-2">
                {driver.driver_type === "taxi" ? "🚕" : "🛵"}
              </div>
              <h2 className="text-lg font-bold text-gray-900">Comment était {driver.name} ?</h2>
              <p className="text-sm text-gray-500 mt-0.5">Votre avis aide les autres utilisateurs</p>
            </div>

            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star)}
                  className="text-4xl transition-transform active:scale-110"
                >
                  <span className={(hovered || rating) >= star ? "text-amber-400" : "text-gray-200"}>★</span>
                </button>
              ))}
            </div>

            {rating > 0 && (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ajouter un commentaire (optionnel)"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 resize-none"
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3.5 rounded-2xl text-sm"
              >
                Passer
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={rating === 0 || submitting}
                className="flex-1 bg-orange-500 text-white font-bold py-3.5 rounded-2xl text-sm disabled:opacity-40 active:scale-95 transition-all"
              >
                {submitting ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
