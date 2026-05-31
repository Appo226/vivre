"use client";

/**
 * /admin — Dashboard administrateur VIVRE
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface AdminStats {
  restaurants: { total: number; pending: number };
  properties:  { total: number; pending: number };
  drivers:     { total: number; pending: number };
  users:       { total: number };
  orders:      { today: number; total: number; today_revenue: number };
  payouts:     { pending: number };
}

function StatCard({ label, value, sub, color = "text-gray-900" }: {
  label: string; value: number | string; sub?: string; color?: string;
}): React.ReactElement {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100">
      <p className={`text-2xl font-bold font-sora ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-dm mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 font-dm">{sub}</p>}
    </div>
  );
}

export default function AdminPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    apiClient
      .get<AdminStats>("/admin/stats")
      .then(setStats)
      .catch(() => setDenied(true))
      .finally(() => setLoading(false));
  }, [accessToken, router]);

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔒</p>
          <p className="font-bold text-gray-900">Accès réservé aux administrateurs</p>
          <button onClick={() => router.back()} className="mt-4 text-green-700 font-dm text-sm underline">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const totalPending = (stats?.restaurants.pending ?? 0) + (stats?.properties.pending ?? 0) + (stats?.drivers.pending ?? 0);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Administration</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {stats && (
          <>
            {/* Alertes en attente */}
            {totalPending > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="font-jakarta font-semibold text-amber-800 text-sm">
                  ⚠️ {totalPending} approbation{totalPending !== 1 ? "s" : ""} en attente
                </p>
                <Link href="/admin/approbations" className="text-xs text-amber-700 underline font-dm">
                  Traiter les approbations →
                </Link>
              </div>
            )}

            {/* Stats du jour */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-dm">Aujourd&apos;hui</p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Commandes" value={stats.orders.today} />
                <StatCard label="Revenus" value={`${stats.orders.today_revenue.toLocaleString()} FCFA`} color="text-green-700" />
              </div>
            </div>

            {/* Stats globales */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-dm">Plateforme</p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Utilisateurs" value={stats.users.total} />
                <StatCard label="Commandes total" value={stats.orders.total} />
                <StatCard
                  label="Restaurants"
                  value={stats.restaurants.total}
                  {...(stats.restaurants.pending > 0 ? { sub: `${stats.restaurants.pending} en attente`, color: "text-amber-600" } : { color: "text-gray-900" })}
                />
                <StatCard
                  label="Hébergements"
                  value={stats.properties.total}
                  {...(stats.properties.pending > 0 ? { sub: `${stats.properties.pending} en attente`, color: "text-amber-600" } : { color: "text-gray-900" })}
                />
                <StatCard
                  label="Chauffeurs"
                  value={stats.drivers.total}
                  {...(stats.drivers.pending > 0 ? { sub: `${stats.drivers.pending} en attente`, color: "text-amber-600" } : { color: "text-gray-900" })}
                />
                <StatCard
                  label="Versements"
                  value={stats.payouts.pending}
                  sub="en cours de traitement"
                />
              </div>
            </div>

            {/* Navigation */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-dm">Actions</p>
              <div className="space-y-2">
                {[
                  { href: "/admin/approbations", icon: "✅", label: "Approbations", sub: `${totalPending} en attente` },
                  { href: "/admin/remboursements", icon: "💳", label: "Remboursements mobile money", sub: "Traiter les remboursements" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 border border-gray-100 hover:shadow-sm transition-all"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-jakarta font-semibold text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500 font-dm">{item.sub}</p>
                    </div>
                    <span className="text-gray-300">›</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
