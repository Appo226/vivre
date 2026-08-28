"use client";

export const dynamic = "force-dynamic";

/**
 * /admin — Dashboard administrateur VIVRE (billetterie)
 *
 * Vue d'ensemble avec compteurs en attente pour chaque file — chaque carte mène à la
 * page de traitement correspondante, câblée sur les routes /api/admin/* déjà en place.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { VivreLogo } from "@/components/VivreLogo";
import { useAuthStore } from "@/store/auth.store";

interface Counts {
  events: number;
  verifications: number;
  refunds: number;
  payouts: number;
}

function StatCard({ href, icon, label, count, loading }: {
  href: string; icon: string; label: string; count: number; loading: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
    >
      <span className="text-2xl w-10 text-center">{icon}</span>
      <div className="flex-1">
        <p className="font-jakarta font-bold text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-400">En attente de traitement</p>
      </div>
      <span className={[
        "font-sora font-extrabold text-2xl min-w-[2ch] text-right",
        loading ? "text-gray-300" : count > 0 ? "text-[#EF2B2D]" : "text-gray-300",
      ].join(" ")}>
        {loading ? "…" : count}
      </span>
    </Link>
  );
}

function AdminDashboard(): React.ReactElement {
  const [counts, setCounts] = useState<Counts>({ events: 0, verifications: 0, refunds: 0, payouts: 0 });
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = useAuthStore((s) => s.hasRole("super_admin"));

  useEffect(() => {
    void (async () => {
      try {
        const [events, verifications, refunds, payouts] = await Promise.all([
          apiClient.get<{ events: unknown[] }>("/admin/events?status=pending_approval"),
          apiClient.get<{ verifications: unknown[] }>("/admin/organizer-verifications?status=pending_review"),
          apiClient.get<{ refunds: unknown[] }>("/admin/refunds?status=pending"),
          apiClient.get<{ payouts: unknown[] }>("/admin/payouts?status=eligible"),
        ]);
        setCounts({
          events: events.events.length,
          verifications: verifications.verifications.length,
          refunds: refunds.refunds.length,
          payouts: payouts.payouts.length,
        });
      } catch {
        /* Compteurs à zéro si l'appel échoue — les pages de détail montreront l'erreur réelle */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="md:hidden bg-dark text-white px-4 pt-safe-top pb-6">
        <div className="flex items-center justify-between pt-4 mb-4">
          <VivreLogo size={26} variant="light" />
          {/* Pas de bottom nav sur /admin (voir (app)/layout.tsx) — seul lien retour vers l'app sur mobile */}
          <Link href="/" className="text-white/60 hover:text-white text-sm font-dm">
            Fermer ✕
          </Link>
        </div>
        <p className="font-sora font-bold text-xl">Administration</p>
        <p className="text-white/50 text-sm font-dm">Files d&apos;attente et paramètres de la plateforme</p>
      </header>

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-4xl">
        <p className="hidden md:block font-sora font-bold text-2xl text-gray-900 mb-1">Vue d&apos;ensemble</p>
        <p className="hidden md:block text-gray-400 text-sm mb-6">Files d&apos;attente et paramètres de la plateforme</p>

        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          <StatCard href="/admin/evenements" icon="🎟️" label="Événements à approuver" count={counts.events} loading={loading} />
          <StatCard href="/admin/verifications" icon="🪪" label="Vérifications organisateur" count={counts.verifications} loading={loading} />
          <StatCard href="/admin/remboursements" icon="💸" label="Remboursements" count={counts.refunds} loading={loading} />
          <StatCard href="/admin/versements" icon="🏦" label="Versements éligibles" count={counts.payouts} loading={loading} />
        </div>

        <Link
          href="/admin/parametres"
          className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow mt-3 md:mt-4"
        >
          <span className="text-2xl w-10 text-center">⚙️</span>
          <div className="flex-1">
            <p className="font-jakarta font-bold text-gray-900 text-sm">Paramètres de la plateforme</p>
            <p className="text-xs text-gray-400">Frais, période gratuite, délais de versement</p>
          </div>
          <span className="text-gray-300 text-sm">›</span>
        </Link>

        {isSuperAdmin && (
          <Link
            href="/admin/equipe"
            className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow mt-3"
          >
            <span className="text-2xl w-10 text-center">🔑</span>
            <div className="flex-1">
              <p className="font-jakarta font-bold text-gray-900 text-sm">Équipe</p>
              <p className="text-xs text-gray-400">Accorder ou retirer l&apos;accès administrateur</p>
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </Link>
        )}
      </div>
    </main>
  );
}

export default function AdminPage(): React.ReactElement {
  return <AdminDashboard />;
}
