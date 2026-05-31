"use client";

/**
 * (dashboard)/page.tsx — Vue d'ensemble de la plateforme VIVRE
 *
 * Affiche les métriques clés :
 *   - Restaurants / hébergements en attente d'approbation
 *   - Livreurs en attente d'approbation
 *   - Versements en attente de traitement
 *   - Commandes du jour + CA du jour
 *
 * Les compteurs "en attente" sont des liens directs vers les sections
 * concernées pour que l'admin puisse agir immédiatement.
 *
 * Rafraîchissement toutes les 60s.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface AdminStats {
  restaurants: { total: number; pending: number };
  properties:  { total: number; pending: number };
  drivers:     { total: number; pending: number };
  users:       { total: number };
  orders: {
    today:         number;
    total:         number;
    today_revenue: number;
  };
  payouts: { pending: number };
}

/* ============================================================
 * COMPOSANTS
 * ============================================================ */

function StatCard({
  label, value, sub, icon, color, href,
}: {
  label: string; value: number | string; sub?: string;
  icon: string; color: string; href?: string;
}) {
  const content = (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function AlertCard({
  count, label, href, icon,
}: {
  count: number; label: string; href: string; icon: string;
}) {
  if (count === 0) return null;
  return (
    <Link href={href}>
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between hover:bg-orange-100 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="font-semibold text-orange-900 text-sm">{count} {label}</p>
            <p className="text-xs text-orange-600">Cliquer pour traiter →</p>
          </div>
        </div>
        <span className="bg-orange-500 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center">
          {count}
        </span>
      </div>
    </Link>
  );
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function AdminOverviewPage() {
  const { accessToken } = useAuthStore();
  const [stats, setStats]     = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  async function loadStats() {
    if (!accessToken) return;
    try {
      const res = await apiClient.get<AdminStats>("/admin/stats");
      setStats(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
    const t = setInterval(() => void loadStats(), 60_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const totalPending = (stats?.restaurants.pending ?? 0)
    + (stats?.properties.pending ?? 0)
    + (stats?.drivers.pending ?? 0)
    + (stats?.payouts.pending ?? 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vue d'ensemble</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Alertes — actions en attente */}
      {!loading && totalPending > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions requises</p>
          <AlertCard count={stats?.restaurants.pending ?? 0} label="restaurant(s) en attente d'approbation" href="/restaurants?status=pending" icon="🍽️" />
          <AlertCard count={stats?.drivers.pending ?? 0}     label="livreur(s) en attente d'approbation"    href="/drivers?status=pending"     icon="🛵" />
          <AlertCard count={stats?.payouts.pending ?? 0}     label="versement(s) en attente de traitement"  href="/payouts"                    icon="💸" />
        </div>
      )}

      {/* Métriques du jour */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Aujourd'hui</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Commandes" icon="📦" color="text-blue-600"
            value={loading ? "—" : stats?.orders.today ?? 0}
          />
          <StatCard
            label="CA (FCFA)" icon="💰" color="text-green-600"
            value={loading ? "—" : (stats?.orders.today_revenue ?? 0).toLocaleString()}
          />
          <StatCard
            label="Livreurs en attente" icon="🛵" color="text-orange-600"
            value={loading ? "—" : stats?.drivers.pending ?? 0}
            href="/drivers?status=pending"
          />
          <StatCard
            label="Versements en attente" icon="💸" color="text-purple-600"
            value={loading ? "—" : stats?.payouts.pending ?? 0}
            href="/payouts"
          />
        </div>
      </div>

      {/* Métriques globales */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Plateforme</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Restaurants" icon="🍽️" color="text-gray-900"
            value={loading ? "—" : stats?.restaurants.total ?? 0}
            {...(!loading ? { sub: `${stats?.restaurants.pending ?? 0} en attente` } : {})}
            href="/restaurants"
          />
          <StatCard
            label="Hébergements" icon="🏨" color="text-gray-900"
            value={loading ? "—" : stats?.properties.total ?? 0}
            {...(!loading ? { sub: `${stats?.properties.pending ?? 0} en attente` } : {})}
          />
          <StatCard
            label="Livreurs" icon="🛵" color="text-gray-900"
            value={loading ? "—" : stats?.drivers.total ?? 0}
            href="/drivers"
          />
          <StatCard
            label="Utilisateurs inscrits" icon="👥" color="text-gray-900"
            value={loading ? "—" : (stats?.users.total ?? 0).toLocaleString()}
          />
        </div>
      </div>

      {/* Total commandes */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total commandes (toutes périodes)</p>
          <p className="text-3xl font-bold text-gray-900 mt-0.5">
            {loading ? "—" : (stats?.orders.total ?? 0).toLocaleString()}
          </p>
        </div>
        <span className="text-4xl">📦</span>
      </div>
    </div>
  );
}
