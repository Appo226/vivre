"use client";

/**
 * (auth)/auth/page.tsx — Connexion dashboard fournisseur
 *
 * Connexion en deux étapes via OTP SMS (même API que le web app) :
 *   1. Entrer le numéro de téléphone → POST /auth/send-otp
 *   2. Entrer le code reçu par SMS → POST /auth/verify-otp
 *
 * Après connexion, on charge le profil fournisseur pour déterminer si
 * l'utilisateur gère un restaurant, une propriété, ou les deux.
 * Puis on redirige vers le dashboard approprié.
 *
 * Accès réservé aux utilisateurs ayant le rôle "supplier".
 */

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";
import type { SupplierUser } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface AuthResponse {
  access_token:  string;
  refresh_token: string;
  user: {
    id:         string;
    phone:      string;
    first_name: string | null;
    last_name:  string | null;
    roles:      string[];
  };
}

interface RestaurantMine {
  id: string;
}

interface PropertyMine {
  id: string;
}

/* ============================================================
 * COMPOSANT INTERNE
 * ============================================================ */

function AuthContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth }  = useAuthStore();

  const [step, setStep]       = useState<"phone" | "otp">("phone");
  const [phone, setPhone]     = useState("");
  const [otp, setOtp]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  /* --------------------------------------------------------
   * Étape 1 : envoyer l'OTP
   * -------------------------------------------------------- */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/send-otp", { phone }, { skipAuth: true });
      setStep("otp");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* --------------------------------------------------------
   * Étape 2 : vérifier l'OTP + charger le profil fournisseur
   * -------------------------------------------------------- */
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await apiClient.post<AuthResponse>(
        "/auth/verify-otp",
        { phone, code: otp },
        { skipAuth: true }
      );

      /* Vérifier que l'utilisateur a le rôle supplier */
      if (!auth.user.roles.includes("supplier")) {
        setError("Ce compte n'a pas accès au dashboard fournisseur. Contactez l'équipe VIVRE.");
        setLoading(false);
        return;
      }

      /* Charger les IDs restaurant / propriété pour la navigation */
      let restaurantId: string | null = null;
      let propertyId:   string | null = null;

      /* Injecter le token temporairement pour les appels suivants */
      localStorage.setItem("vivre-supplier-auth", JSON.stringify({
        state: { accessToken: auth.access_token, refreshToken: auth.refresh_token }
      }));

      try {
        const rest = await apiClient.get<{ restaurants: RestaurantMine[] }>("/restaurants/mine");
        restaurantId = rest.restaurants[0]?.id ?? null;
      } catch { /* Pas de restaurant */ }

      try {
        const prop = await apiClient.get<{ properties: PropertyMine[] }>("/properties/mine");
        propertyId = prop.properties[0]?.id ?? null;
      } catch { /* Pas de propriété */ }

      const supplierType =
        restaurantId && propertyId ? "both" :
        restaurantId              ? "restaurant" :
        propertyId                ? "property"   : null;

      const user: SupplierUser = {
        id:           auth.user.id,
        phone:        auth.user.phone,
        first_name:   auth.user.first_name,
        last_name:    auth.user.last_name,
        roles:        auth.user.roles,
        supplierType,
        restaurantId,
        propertyId,
      };

      setAuth({ accessToken: auth.access_token, refreshToken: auth.refresh_token, user });

      /* Cookie pour le middleware */
      document.cookie = `vivre_supplier_token=${auth.access_token}; path=/; max-age=604800; SameSite=Lax`;

      const redirect = searchParams.get("redirect") ?? "/";
      router.push(redirect);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏪</div>
          <h1 className="text-2xl font-bold text-gray-900">VIVRE Fournisseur</h1>
          <p className="text-gray-500 text-sm mt-1">Dashboard restaurateurs & hôteliers</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={(e) => void handleSendOtp(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numéro de téléphone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+226 XX XX XX XX"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-orange-400 outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Envoi…" : "Recevoir le code SMS"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-4">
            <p className="text-sm text-gray-500 text-center">
              Code envoyé au <strong>{phone}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code à 6 chiffres
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-3xl tracking-widest text-center font-mono focus:ring-2 focus:ring-orange-400 outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
            <button
              type="submit"
              disabled={loading || otp.length < 4}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Vérification…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setOtp(""); setError(null); }}
              className="w-full text-gray-500 text-sm hover:text-gray-700"
            >
              ← Changer de numéro
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-white text-xl">Chargement…</div></div>}>
      <AuthContent />
    </Suspense>
  );
}
