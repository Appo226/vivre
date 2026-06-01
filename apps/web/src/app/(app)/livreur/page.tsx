"use client";

export const dynamic = "force-dynamic";

/**
 * livreur/page.tsx — Tableau de bord livreur VIVRE
 *
 * Page d'accueil du livreur une fois son compte approuvé.
 * Affiche :
 *   - Statut de disponibilité (toggle on/off) — seuls les livreurs "available"
 *     reçoivent des commandes
 *   - Statistiques du jour (livraisons, gains bruts)
 *   - Livraisons en cours assignées à ce livreur
 *   - Lien vers le détail des gains et les demandes de versement
 *
 * Rafraîchissement automatique toutes les 30 secondes pour les livreurs
 * disponibles — simule un flux temps réel sans WebSocket.
 * En production : remplacer par WebSocket /ws/drivers/:id/deliveries.
 *
 * Accès : GET /drivers/me (données livreur + statut)
 *         GET /drivers/me/deliveries?status=picked_up (livraisons actives)
 *         PATCH /drivers/me/availability (toggle disponibilité)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface DriverProfile {
  id: string;
  driver_type: string;
  vehicle_type: string;
  city: string;
  status: string;             /* available | busy | offline */
  application_status: string; /* pending | approved | rejected */
  payout_method: string | null;
  payout_phone: string | null;
  rating: number | null;
  total_deliveries: number;
  total_earnings_fcfa: number;
}

interface ActiveDelivery {
  id: string;
  status: string;
  restaurant_name: string;
  delivery_address: string;
  delivery_fee: number;
  driver_share: number;   /* 80% of delivery_fee */
  customer_phone?: string;
  created_at: string;
}

/* ============================================================
 * COMPOSANTS UTILITAIRES
 * ============================================================ */

/**
 * Badge de statut du livreur.
 * Vert = disponible, jaune = occupé, gris = hors-ligne.
 */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-green-100 text-green-800 border-green-200",
    busy:      "bg-yellow-100 text-yellow-800 border-yellow-200",
    offline:   "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    available: "Disponible",
    busy:      "En livraison",
    offline:   "Hors ligne",
  };
  const cls = styles[status] ?? styles["offline"]!;
  const label = labels[status] ?? "Inconnu";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === "available" ? "bg-green-500 animate-pulse" : status === "busy" ? "bg-yellow-500" : "bg-gray-400"}`} />
      {label}
    </span>
  );
}

/**
 * Carte de livraison active.
 * Affiche les infos essentielles : restaurant, adresse, gain attendu.
 */
function DeliveryCard({ delivery }: { delivery: ActiveDelivery }) {
  const router = useRouter();
  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => router.push(`/food/mes-commandes/${delivery.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Restaurant et statut */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🛵</span>
            <p className="font-semibold text-gray-900 truncate">{delivery.restaurant_name}</p>
          </div>
          {/* Adresse de livraison */}
          <p className="text-sm text-gray-500 truncate">{delivery.delivery_address}</p>
          {/* Statut commande */}
          <p className="text-xs text-orange-600 font-medium mt-1">
            {delivery.status === "picked_up" ? "En route → en attente de livraison" : "En préparation — aller chercher bientôt"}
          </p>
        </div>
        {/* Gain attendu */}
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-green-700 text-lg">{delivery.driver_share.toLocaleString()} F</p>
          <p className="text-xs text-gray-400">votre part</p>
        </div>
      </div>
      {/* Contact client si disponible */}
      {delivery.customer_phone && (
        <a
          href={`tel:${delivery.customer_phone}`}
          className="mt-3 flex items-center gap-2 text-sm text-blue-600 font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          <span>📞</span> Appeler le client
        </a>
      )}
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

export default function LivreurDashboardPage() {
  const router = useRouter();
  /* accessToken est le nom dans AuthState — pas "token" */
  const { accessToken, user } = useAuthStore();

  /* État livreur */
  const [driver, setDriver]             = useState<DriverProfile | null>(null);
  const [activeDeliveries, setActive]   = useState<ActiveDelivery[]>([]);
  const [todayStats, setTodayStats]     = useState({ count: 0, earnings: 0 });

  /* UI state */
  const [loading, setLoading]           = useState(true);
  const [toggling, setToggling]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  /* Ref pour le setInterval afin de le nettoyer proprement */
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* --------------------------------------------------------
   * Chargement des données livreur
   * apiClient injecte automatiquement le Bearer token depuis le store —
   * pas besoin de le passer manuellement.
   * -------------------------------------------------------- */
  const loadData = useCallback(async () => {
    if (!accessToken) return;
    try {
      /* Profil livreur — inclut statut, note, total livraisons */
      const profile = await apiClient.get<DriverProfile>("/drivers/me");
      setDriver(profile);

      /* Livraisons actives (picked_up assignées à ce livreur) */
      const deliveriesRes = await apiClient.get<{ deliveries: ActiveDelivery[] }>(
        "/drivers/me/deliveries?status=picked_up"
      );
      setActive(deliveriesRes.deliveries ?? []);

      /* Statistiques du jour — on filtre par plage horaire UTC du jour courant */
      const today = new Date().toISOString().split("T")[0]!;
      const gainsRes = await apiClient.get<{ total_fcfa: number; deliveries_count: number }>(
        `/drivers/me/earnings?from=${today}T00:00:00Z&to=${today}T23:59:59Z`
      );
      setTodayStats({ count: gainsRes.deliveries_count ?? 0, earnings: gainsRes.total_fcfa ?? 0 });

      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        /* 404 = pas encore livreur → rediriger vers candidature */
        if (err.status === 404) {
          router.push("/devenir-livreur");
          return;
        }
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, router]);

  /* --------------------------------------------------------
   * Initialisation + auto-refresh toutes les 30 secondes
   * pour les livreurs disponibles/occupés
   * -------------------------------------------------------- */
  useEffect(() => {
    if (!accessToken) {
      router.push("/auth");
      return;
    }
    loadData();
  }, [accessToken, router, loadData]);

  /* Lance le refresh automatique seulement si le livreur est actif */
  useEffect(() => {
    if (!driver) return;
    if (driver.status === "offline") {
      /* Pas de refresh si hors ligne — inutile */
      if (refreshRef.current) clearInterval(refreshRef.current);
      return;
    }
    refreshRef.current = setInterval(loadData, 30_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [driver?.status, loadData]);

  /* --------------------------------------------------------
   * Toggle disponibilité
   * available ↔ offline (le statut "busy" est géré automatiquement
   * par le serveur quand une commande est assignée)
   * -------------------------------------------------------- */
  const toggleAvailability = async () => {
    if (!driver || toggling) return;
    const newStatus = driver.status === "available" ? "offline" : "available";
    setToggling(true);
    try {
      /* apiClient.patch injette le token automatiquement */
      await apiClient.patch("/drivers/me/availability", { status: newStatus });
      setDriver((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  /* ============================================================
   * RENDER : CHARGEMENT
   * ============================================================ */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🛵</div>
          <p className="text-gray-500">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER : CANDIDATURE EN ATTENTE OU REJETÉE
   * ============================================================ */
  if (driver && driver.application_status !== "approved") {
    const isRejected = driver.application_status === "rejected";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">{isRejected ? "❌" : "⏳"}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isRejected ? "Candidature non retenue" : "Candidature en cours d'examen"}
          </h1>
          <p className="text-gray-500 text-sm">
            {isRejected
              ? "Votre candidature n'a pas été approuvée. Vérifiez vos documents et repostulez."
              : "Notre équipe examine vos documents. Vous recevrez une réponse sous 24–48 heures ouvrées."}
          </p>
          {isRejected && (
            <Link
              href="/devenir-livreur"
              className="mt-6 inline-block bg-orange-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
            >
              Repostuler
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER : TABLEAU DE BORD ACTIF
   * ============================================================ */
  const isOnline = driver?.status !== "offline";
  /* Prénom depuis first_name (AuthUser n'a pas de champ full_name) */
  const displayName = user?.first_name ?? "Livreur";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── En-tête ── */}
      <div className={`${isOnline ? "bg-orange-500" : "bg-gray-700"} text-white px-4 pt-12 pb-8 transition-colors duration-300`}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-orange-100 text-sm">Bonjour,</p>
              <h1 className="text-2xl font-bold">{displayName}</h1>
              <div className="mt-2">
                <StatusBadge status={driver?.status ?? "offline"} />
              </div>
            </div>
            {/* Bouton disponibilité */}
            <button
              onClick={toggleAvailability}
              disabled={toggling || driver?.status === "busy"}
              className={`
                flex flex-col items-center gap-1 px-4 py-3 rounded-2xl font-semibold text-sm
                transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed
                ${isOnline
                  ? "bg-white text-orange-600 shadow-lg"
                  : "bg-orange-500 text-white border-2 border-white border-dashed"
                }
              `}
            >
              <span className="text-2xl">{isOnline ? "🟢" : "⭕"}</span>
              <span>{toggling ? "…" : isOnline ? "En ligne" : "Hors ligne"}</span>
            </button>
          </div>

          {/* Note moyenne et total livraisons */}
          {driver && (
            <div className="flex gap-4 mt-4">
              {driver.rating !== null && (
                <div className="flex items-center gap-1 bg-white/20 rounded-lg px-3 py-1.5">
                  <span className="text-yellow-300">⭐</span>
                  <span className="font-semibold">{driver.rating.toFixed(1)}</span>
                </div>
              )}
              <div className="flex items-center gap-1 bg-white/20 rounded-lg px-3 py-1.5">
                <span>📦</span>
                <span className="font-semibold">{driver.total_deliveries}</span>
                <span className="text-sm opacity-80">livraisons</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-4">
        {/* ── Message d'erreur ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Stats du jour ── */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Aujourd'hui</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-orange-50 rounded-xl">
              <p className="text-3xl font-bold text-orange-600">{todayStats.count}</p>
              <p className="text-xs text-gray-500 mt-1">livraison{todayStats.count > 1 ? "s" : ""}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <p className="text-3xl font-bold text-green-700">{todayStats.earnings.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">FCFA gagnés</p>
            </div>
          </div>
        </div>

        {/* ── Livraisons en cours ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-700">Livraisons en cours</h2>
            {activeDeliveries.length > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                {activeDeliveries.length}
              </span>
            )}
          </div>
          {activeDeliveries.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <p className="text-4xl mb-3">{isOnline ? "📡" : "😴"}</p>
              <p className="text-gray-500 text-sm">
                {isOnline
                  ? "Aucune livraison en cours. Restez disponible !"
                  : "Vous êtes hors ligne. Activez votre disponibilité pour recevoir des commandes."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDeliveries.map((d) => (
                <DeliveryCard key={d.id} delivery={d} />
              ))}
            </div>
          )}
        </div>

        {/* ── Navigation rapide ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Mode course intraurbain — taxi/zémidjan */}
          <Link
            href="/livreur/courses"
            className="bg-orange-50 border border-orange-200 rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
          >
            <span className="text-3xl">🛵</span>
            <div>
              <p className="font-semibold text-orange-800 text-sm">Mode course</p>
              <p className="text-xs text-orange-400">Taxi & Zémidjan</p>
            </div>
          </Link>
          <Link
            href="/livreur/gains"
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
          >
            <span className="text-3xl">💰</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Mes gains</p>
              <p className="text-xs text-gray-400">Versements & historique</p>
            </div>
          </Link>
          <Link
            href="/profile"
            className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
          >
            <span className="text-3xl">👤</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Mon profil</p>
              <p className="text-xs text-gray-400">Infos & documents</p>
            </div>
          </Link>
        </div>

        {/* ── Info ville + type véhicule ── */}
        {driver && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mon véhicule</p>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{driver.driver_type === "taxi" ? "🚕" : "🛵"}</span>
              <div>
                <p className="font-medium text-gray-800">
                  {driver.vehicle_type} — {driver.driver_type === "zemidjan" ? "Zémidjan" : driver.driver_type === "taxi" ? "Taxi" : "Moto & Taxi"}
                </p>
                <p className="text-sm text-gray-500">{driver.city}</p>
              </div>
            </div>
            {!driver.payout_method && (
              <div className="mt-3 p-3 bg-yellow-50 rounded-xl text-sm text-yellow-700">
                ⚠️ Aucun moyen de versement configuré.{" "}
                <Link href="/livreur/gains" className="font-semibold underline">
                  Configurer maintenant
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
