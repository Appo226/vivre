"use client";

export const dynamic = "force-dynamic";

/**
 * course/page.tsx — Transport Intraurbain : demande de course
 *
 * Permet au client de :
 *   1. Saisir son adresse de départ et d'arrivée
 *   2. Choisir le type de véhicule (Taxi ou Zémidjan)
 *   3. Voir l'estimation de prix
 *   4. Choisir son moyen de paiement mobile money
 *   5. Lancer la recherche de chauffeur
 *
 * Après soumission, redirige vers /course/:id pour le suivi en temps réel.
 *
 * IMPORTANT : Le paiement en espèces est exclu — mobile money uniquement.
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";
import PaymentSelector from "@/components/PaymentSelector";

/* ============================================================
 * TYPES
 * ============================================================ */

interface City {
  id: string;
  name: string;
}

interface PriceEstimate {
  estimated_price: number;
  distance_km:     number;
}

interface NearbyDrivers {
  count: number;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const RIDE_TYPES = [
  {
    key:         "zemidjan",
    label:       "Zémidjan",
    description: "Moto-taxi — rapide et économique",
    icon:        "🛵",
    color:       "border-orange-400 bg-orange-50",
    activeColor: "border-orange-500 bg-orange-100",
  },
  {
    key:         "taxi",
    label:       "Taxi",
    description: "Voiture — confort pour plus de passagers",
    icon:        "🚕",
    color:       "border-yellow-400 bg-yellow-50",
    activeColor: "border-yellow-500 bg-yellow-100",
  },
] as const;


/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function CoursePage(): React.ReactElement {
  const router         = useRouter();
  const { accessToken } = useAuthStore();

  /* Formulaire */
  const [pickupAddress,  setPickupAddress]  = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [rideType,       setRideType]       = useState<"zemidjan" | "taxi">("zemidjan");
  const [paymentMethod,  setPaymentMethod]  = useState<"orange_money" | "moov" | "telecel_money">("orange_money");
  const [paymentPhone,   setPaymentPhone]   = useState("");
  const [cityId,         setCityId]         = useState<string>("");

  /* État UI */
  const [cities,          setCities]         = useState<City[]>([]);
  const [estimate,        setEstimate]       = useState<PriceEstimate | null>(null);
  const [nearbyCount,     setNearbyCount]    = useState<number | null>(null);
  const [loading,         setLoading]        = useState(false);
  const [error,           setError]          = useState<string | null>(null);

  /* Géolocalisation utilisateur (lat/lng pour l'estimation) */
  const [pickupLat,  setPickupLat]  = useState<number | null>(null);
  const [pickupLng,  setPickupLng]  = useState<number | null>(null);
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);

  /* Charger les villes disponibles */
  useEffect(() => {
    apiClient
      .get<{ cities: City[] }>("/cities")
      .then((res) => {
        setCities(res.cities ?? []);
        /* Sélectionner Ouagadougou par défaut si disponible */
        const ouaga = res.cities.find((c) => c.name.toLowerCase().includes("ouaga"));
        if (ouaga) setCityId(ouaga.id);
        else if (res.cities[0]) setCityId(res.cities[0].id);
      })
      .catch(() => { /* ignore */ });
  }, []);

  /* Demander la géolocalisation au chargement */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickupLat(pos.coords.latitude);
        setPickupLng(pos.coords.longitude);
        setPickupAddress("Ma position actuelle");
      },
      () => { /* permission refusée — l'utilisateur saisira manuellement */ }
    );
  }, []);

  /* Estimer le prix dès que les deux points sont définis */
  useEffect(() => {
    if (pickupLat === null || pickupLng === null || dropoffLat === null || dropoffLng === null) {
      setEstimate(null);
      return;
    }

    apiClient
      .get<PriceEstimate>(
        `/rides/estimate?pickup_lat=${pickupLat}&pickup_lng=${pickupLng}` +
        `&dropoff_lat=${dropoffLat}&dropoff_lng=${dropoffLng}&ride_type=${rideType}`
      )
      .then((res) => setEstimate(res))
      .catch(() => setEstimate(null));
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, rideType]);

  /* Nombre de chauffeurs disponibles proches */
  useEffect(() => {
    if (pickupLat === null || pickupLng === null) return;
    apiClient
      .get<NearbyDrivers>(`/rides/nearby?lat=${pickupLat}&lng=${pickupLng}&ride_type=${rideType}`)
      .then((res) => setNearbyCount(res.count))
      .catch(() => setNearbyCount(null));
  }, [pickupLat, pickupLng, rideType]);

  /* Simuler le point d'arrivée (en production : geocoding + carte) */
  function handleDropoffChange(value: string): void {
    setDropoffAddress(value);
    /* TODO production : Geocoding API → coordonnées réelles */
    /* Simulation : décalage fixe pour la démo */
    if (value.length > 5 && pickupLat && pickupLng) {
      setDropoffLat(pickupLat + 0.03);
      setDropoffLng(pickupLng + 0.02);
    } else {
      setDropoffLat(null);
      setDropoffLng(null);
    }
  }

  async function handleRequest(): Promise<void> {
    if (!accessToken) {
      router.push("/auth?redirect=/course");
      return;
    }

    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      setError("Veuillez saisir votre adresse de départ et d'arrivée");
      return;
    }
    if (!paymentPhone.trim()) {
      setError("Veuillez entrer votre numéro mobile money");
      return;
    }
    if (!cityId) {
      setError("Veuillez sélectionner votre ville");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post<{ ride_id: string }>("/rides", {
        city_id:         cityId,
        pickup_lat:      pickupLat,
        pickup_lng:      pickupLng,
        dropoff_lat:     dropoffLat,
        dropoff_lng:     dropoffLng,
        ride_type:       rideType,
        payment_method:  paymentMethod,
        payment_phone:   paymentPhone.trim(),
        ...(pickupAddress.trim()  ? { pickup_address: pickupAddress.trim() }   : {}),
        ...(dropoffAddress.trim() ? { dropoff_address: dropoffAddress.trim() } : {}),
      });

      router.push(`/course/${res.ride_id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Erreur réseau — vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }

  const canRequest = Boolean(
    pickupLat && pickupLng &&
    dropoffLat && dropoffLng &&
    paymentPhone.trim() &&
    cityId
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
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
        <div>
          <h1 className="font-bold text-gray-900">Prendre une course</h1>
          <p className="text-xs text-gray-500">Taxi · Zémidjan · Ouagadougou</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Ville */}
        {cities.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ville</label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Itinéraire */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Itinéraire</label>

          {/* Départ */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-green-600 text-sm font-bold">A</span>
            </div>
            <input
              type="text"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Adresse de départ"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Ligne de liaison */}
          <div className="ml-4 h-4 border-l-2 border-dashed border-gray-200" />

          {/* Arrivée */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-sm font-bold">B</span>
            </div>
            <input
              type="text"
              value={dropoffAddress}
              onChange={(e) => handleDropoffChange(e.target.value)}
              placeholder="Adresse d'arrivée"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
        </div>

        {/* Type de véhicule */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Type de véhicule</p>
          <div className="grid grid-cols-2 gap-3">
            {RIDE_TYPES.map((type) => (
              <button
                key={type.key}
                onClick={() => setRideType(type.key)}
                className={`rounded-2xl p-4 text-left border-2 transition-all ${
                  rideType === type.key ? type.activeColor : "bg-white border-gray-100"
                }`}
              >
                <span className="text-2xl block mb-1">{type.icon}</span>
                <p className="font-bold text-gray-900 text-sm">{type.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Estimation de prix */}
        {estimate && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-600 font-medium">Prix estimé</p>
                <p className="text-2xl font-bold text-orange-700">
                  {estimate.estimated_price.toLocaleString()} FCFA
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-orange-500">Distance</p>
                <p className="font-semibold text-orange-700">{estimate.distance_km} km</p>
              </div>
            </div>
            <p className="text-xs text-orange-400 mt-1">Prix indicatif — peut varier légèrement</p>
          </div>
        )}

        {/* Disponibilité chauffeurs */}
        {nearbyCount !== null && (
          <div className={`text-sm font-medium px-4 py-3 rounded-xl ${
            nearbyCount === 0
              ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-700"
          }`}>
            {nearbyCount === 0
              ? "Aucun chauffeur disponible dans votre secteur pour le moment"
              : `${nearbyCount} chauffeur${nearbyCount > 1 ? "s" : ""} disponible${nearbyCount > 1 ? "s" : ""} près de vous`}
          </div>
        )}

        {/* Paiement */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paiement</p>
          <PaymentSelector
            selected={paymentMethod}
            onChange={(key) => setPaymentMethod(key as typeof paymentMethod)}
          />

          <input
            type="tel"
            value={paymentPhone}
            onChange={(e) => setPaymentPhone(e.target.value)}
            placeholder="Ex: +22670000000"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Bouton flottant */}
      <div className="fixed bottom-20 left-0 right-0 px-4">
        <button
          onClick={() => void handleRequest()}
          disabled={loading || !canRequest}
          className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl shadow-2xl disabled:opacity-50 active:scale-[0.99] transition-all text-base"
        >
          {loading ? "Recherche d'un chauffeur…" : "Trouver un chauffeur"}
        </button>
      </div>
    </div>
  );
}
