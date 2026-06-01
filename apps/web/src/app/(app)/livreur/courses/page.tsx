"use client";

export const dynamic = "force-dynamic";

/**
 * livreur/courses/page.tsx — Interface chauffeur : mode course intraurbain
 *
 * Permet au chauffeur de :
 *   1. Passer en ligne (SSE GET /rides/driver/stream)
 *   2. Recevoir les demandes de course en temps réel
 *   3. Accepter une demande (60s pour décider)
 *   4. Mettre à jour sa position GPS toutes les 5 secondes
 *   5. Progresser dans les statuts : arrived → start → complete
 *   6. Annuler si nécessaire
 *
 * Accès : chauffeurs approuvés uniquement (application_status = "approved")
 * Types acceptés : taxi, zémidjan, both
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface IncomingRequest {
  ride_id:         string;
  pickup_address:  string | null;
  dropoff_address: string | null;
  ride_type:       string;
  estimated_price: number;
  pickup_lat:      number;
  pickup_lng:      number;
}

interface ActiveRide {
  id:              string;
  status:          string;
  pickup_address:  string | null;
  dropoff_address: string | null;
  ride_type:       string;
  estimated_price: number;
  driver: { id: string } | null;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const LOCATION_INTERVAL_MS = 5_000; /* Mise à jour GPS toutes les 5 secondes */

/* ============================================================
 * PAGE
 * ============================================================ */

export default function DriverCoursesPage(): React.ReactElement {
  const router         = useRouter();
  const { accessToken } = useAuthStore();

  /* État online/offline */
  const [isOnline,     setIsOnline]     = useState(false);
  const [goingOnline,  setGoingOnline]  = useState(false);

  /* Demande entrante en attente d'acceptation */
  const [incoming,      setIncoming]     = useState<IncomingRequest | null>(null);
  const [timeLeft,      setTimeLeft]     = useState(0);

  /* Course active en cours */
  const [activeRide,    setActiveRide]   = useState<ActiveRide | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,         setError]        = useState<string | null>(null);

  const eventSourceRef   = useRef<EventSource | null>(null);
  const locationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Charger la course active au montage (si le chauffeur reprend après rechargement) */
  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get<{ ride: ActiveRide }>("/rides/driver/active")
      .then((res) => { setActiveRide(res.ride); setIsOnline(true); })
      .catch(() => { /* Pas de course active — normal */ });
  }, [accessToken]);

  /* Mise à jour GPS continue quand en ligne */
  const startLocationUpdates = useCallback(() => {
    if (!navigator.geolocation) return;

    const send = () => {
      navigator.geolocation.getCurrentPosition((pos) => {
        void apiClient.post("/rides/driver/location", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }).catch(() => { /* ignore erreurs GPS */ });
      });
    };

    send(); /* Envoyer immédiatement */
    locationTimerRef.current = setInterval(send, LOCATION_INTERVAL_MS);
  }, []);

  const stopLocationUpdates = useCallback(() => {
    if (locationTimerRef.current) {
      clearInterval(locationTimerRef.current);
      locationTimerRef.current = null;
    }
  }, []);

  /* Passer en ligne */
  async function goOnline(): Promise<void> {
    if (!accessToken) { router.push("/auth"); return; }
    setGoingOnline(true);
    setError(null);

    try {
      const res = await apiClient.post<{ driver_id: string; city_id: string }>("/rides/driver/online", {});

      /* Ouvrir le SSE de réception des demandes */
      const BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";
      const source   = new EventSource(`${BASE_URL}/rides/driver/stream`, { withCredentials: false });
      eventSourceRef.current = source;

      source.addEventListener("connected", () => {
        setIsOnline(true);
      });

      source.addEventListener("new_request", (e) => {
        const data = JSON.parse(e.data) as IncomingRequest;
        setIncoming(data);

        /* Compte à rebours de 60s */
        setTimeLeft(60);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              setIncoming(null); /* Demande expirée */
              return 0;
            }
            return prev - 1;
          });
        }, 1_000);
      });

      source.addEventListener("ride_cancelled", () => {
        setActiveRide(null);
        setIncoming(null);
      });

      source.onerror = () => {
        /* EventSource reconnecte automatiquement */
      };

      startLocationUpdates();
      void res; /* Évite le warning "unused" */

    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible de passer en ligne");
    } finally {
      setGoingOnline(false);
    }
  }

  /* Passer hors ligne */
  async function goOffline(): Promise<void> {
    try {
      await apiClient.post("/rides/driver/offline", {});
    } catch { /* ignore */ }

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    stopLocationUpdates();
    if (countdownRef.current) clearInterval(countdownRef.current);

    setIsOnline(false);
    setIncoming(null);
    setActiveRide(null);
  }

  /* Nettoyer à la destruction */
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      stopLocationUpdates();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [stopLocationUpdates]);

  /* Accepter une course */
  async function acceptRide(rideId: string): Promise<void> {
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.post(`/rides/${rideId}/accept`, {});
      /* Charger la course active */
      const res = await apiClient.get<{ ride: ActiveRide }>(`/rides/${rideId}`);
      setActiveRide(res.ride);
      setIncoming(null);
      if (countdownRef.current) clearInterval(countdownRef.current);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      setIncoming(null);
    } finally {
      setActionLoading(false);
    }
  }

  /* Progresser dans le statut de la course */
  async function updateRideStatus(action: "arrived" | "start" | "complete" | "driver-cancel"): Promise<void> {
    if (!activeRide) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.post(`/rides/${activeRide.id}/${action}`, {});
      if (action === "complete" || action === "driver-cancel") {
        setActiveRide(null);
      } else {
        /* Recharger la course pour avoir le nouveau statut */
        const res = await apiClient.get<{ ride: ActiveRide }>(`/rides/${activeRide.id}`);
        setActiveRide(res.ride);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* En-tête */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-900">Mode course</h1>
          <p className="text-xs text-gray-500">Taxi · Zémidjan</p>
        </div>
        {/* Indicateur de statut */}
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
          isOnline ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          {isOnline ? "En ligne" : "Hors ligne"}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Toggle en ligne / hors ligne */}
        {!activeRide && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            {isOnline ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Vous êtes en ligne. Les demandes de course s'afficheront automatiquement.
                  Votre position est partagée toutes les 5 secondes.
                </p>
                <button
                  onClick={() => void goOffline()}
                  className="w-full border-2 border-red-200 text-red-600 font-semibold py-3.5 rounded-xl text-sm active:scale-95 transition-all"
                >
                  Passer hors ligne
                </button>
              </>
            ) : (
              <>
                <p className="text-2xl text-center mb-2">🛵</p>
                <p className="text-center text-gray-600 text-sm mb-4">
                  Passez en ligne pour recevoir des demandes de course dans votre ville.
                </p>
                <button
                  onClick={() => void goOnline()}
                  disabled={goingOnline}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
                >
                  {goingOnline ? "Connexion…" : "Passer en ligne"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Demande entrante */}
        {incoming && !activeRide && (
          <div className="bg-white rounded-2xl shadow-lg border-2 border-orange-400 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl animate-bounce">🔔</span>
                <p className="font-bold text-gray-900">Nouvelle demande</p>
              </div>
              {/* Compte à rebours */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                timeLeft > 20 ? "border-green-400 text-green-700 bg-green-50" :
                timeLeft > 10 ? "border-orange-400 text-orange-700 bg-orange-50" :
                "border-red-400 text-red-700 bg-red-50"
              }`}>
                {timeLeft}s
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 mt-0.5">A</span>
                <p className="text-gray-700">{incoming.pickup_address ?? "Position partagée"}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-500 font-bold text-xs flex-shrink-0 mt-0.5">B</span>
                <p className="text-gray-700">{incoming.dropoff_address ?? "Destination"}</p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-orange-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs text-orange-600">Gain estimé</p>
                <p className="text-xl font-bold text-orange-700">
                  {incoming.estimated_price.toLocaleString()} FCFA
                </p>
              </div>
              <span className="text-2xl">{incoming.ride_type === "taxi" ? "🚕" : "🛵"}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setIncoming(null); if (countdownRef.current) clearInterval(countdownRef.current); }}
                className="py-3.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 active:scale-95 transition-all"
              >
                Refuser
              </button>
              <button
                onClick={() => void acceptRide(incoming.ride_id)}
                disabled={actionLoading}
                className="py-3.5 bg-orange-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 active:scale-95 transition-all"
              >
                {actionLoading ? "…" : "Accepter"}
              </button>
            </div>
          </div>
        )}

        {/* Course active */}
        {activeRide && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">Course en cours</p>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  activeRide.status === "accepted"    ? "bg-blue-100 text-blue-700" :
                  activeRide.status === "arrived"     ? "bg-orange-100 text-orange-700" :
                  activeRide.status === "in_progress" ? "bg-purple-100 text-purple-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {activeRide.status === "accepted"    ? "En route" :
                   activeRide.status === "arrived"     ? "Arrivé" :
                   activeRide.status === "in_progress" ? "En cours" : activeRide.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 mt-0.5">A</span>
                  <p className="text-gray-700">{activeRide.pickup_address ?? "Point de départ"}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-500 font-bold text-xs flex-shrink-0 mt-0.5">B</span>
                  <p className="text-gray-700">{activeRide.dropoff_address ?? "Destination"}</p>
                </div>
              </div>

              <div className="bg-orange-50 rounded-xl px-4 py-3 flex justify-between items-center">
                <p className="text-xs text-orange-600">Montant</p>
                <p className="text-xl font-bold text-orange-700">
                  {activeRide.estimated_price.toLocaleString()} FCFA
                </p>
              </div>
            </div>

            {/* Actions selon le statut */}
            <div className="space-y-2">
              {activeRide.status === "accepted" && (
                <>
                  <button
                    onClick={() => void updateRideStatus("arrived")}
                    disabled={actionLoading}
                    className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {actionLoading ? "…" : "Je suis arrivé au point de départ"}
                  </button>
                  <button
                    onClick={() => void updateRideStatus("driver-cancel")}
                    disabled={actionLoading}
                    className="w-full border border-red-200 text-red-600 font-semibold py-3 rounded-2xl text-sm active:scale-95 transition-all"
                  >
                    Annuler la course
                  </button>
                </>
              )}

              {activeRide.status === "arrived" && (
                <button
                  onClick={() => void updateRideStatus("start")}
                  disabled={actionLoading}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-all"
                >
                  {actionLoading ? "…" : "Démarrer la course — client à bord"}
                </button>
              )}

              {activeRide.status === "in_progress" && (
                <button
                  onClick={() => void updateRideStatus("complete")}
                  disabled={actionLoading}
                  className="w-full bg-green-600 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-all"
                >
                  {actionLoading ? "…" : "Terminer la course"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* En attente sans demande */}
        {isOnline && !incoming && !activeRide && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-5xl mb-3">📡</p>
            <p className="font-semibold text-gray-800">En attente de demandes</p>
            <p className="text-sm text-gray-400 mt-1">Les nouvelles courses apparaîtront automatiquement</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
}
