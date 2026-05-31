"use client";

/**
 * (auth)/auth/page.tsx — Connexion admin VIVRE
 *
 * Même flux OTP que le dashboard fournisseur.
 * Après vérification du code, on contrôle que l'utilisateur
 * possède le rôle "admin" — sinon accès refusé.
 */

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";
import type { AdminUser } from "@/store/auth.store";

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

function AuthContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth }  = useAuthStore();

  const [step, setStep]       = useState<"phone" | "otp">("phone");
  const [phone, setPhone]     = useState("");
  const [otp, setOtp]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true); setError(null);
    try {
      await apiClient.post("/auth/send-otp", { phone }, { skipAuth: true });
      setStep("otp");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true); setError(null);
    try {
      const auth = await apiClient.post<AuthResponse>(
        "/auth/verify-otp",
        { phone, code: otp },
        { skipAuth: true }
      );

      if (!auth.user.roles.includes("admin")) {
        setError("Ce compte n'a pas accès au dashboard administrateur.");
        setLoading(false);
        return;
      }

      const user: AdminUser = {
        id:         auth.user.id,
        phone:      auth.user.phone,
        first_name: auth.user.first_name,
        last_name:  auth.user.last_name,
        roles:      auth.user.roles,
      };

      setAuth({ accessToken: auth.access_token, refreshToken: auth.refresh_token, user });
      document.cookie = `vivre_admin_token=${auth.access_token}; path=/; max-age=604800; SameSite=Lax`;

      const redirect = searchParams.get("redirect") ?? "/";
      router.push(redirect);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🛡️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">VIVRE Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Tableau de bord administrateur</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={(e) => void handleSendOtp(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de téléphone</label>
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
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50"
            >
              {loading ? "Envoi…" : "Recevoir le code SMS"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-4">
            <p className="text-sm text-gray-500 text-center">Code envoyé au <strong>{phone}</strong></p>
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
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
            <button
              type="submit"
              disabled={loading || otp.length < 4}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50"
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
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement…</div>
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
