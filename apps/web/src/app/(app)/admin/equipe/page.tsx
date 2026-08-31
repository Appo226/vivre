"use client";

export const dynamic = "force-dynamic";

/**
 * /admin/equipe — Gestion des administrateurs (super_admin uniquement).
 *
 * Accorder le rôle "admin" à un compte existant, ou le retirer. Le rôle "super_admin"
 * lui-même n'apparaît ici que pour information (badge) — il ne se pose jamais depuis
 * cette page (voir /api/admin/team). Garde-fou double : la route API refuse déjà tout
 * appelant sans "super_admin", et cette page se ferme elle-même si le rôle manque —
 * un admin normal qui devinerait l'URL ne voit jamais le formulaire.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { AdminHeader } from "@/components/AdminHeader";
import { useAuthStore } from "@/store/auth.store";

interface TeamMember {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  roles: string[];
  since: string | null;
}

export default function AdminTeamPage(): React.ReactElement | null {
  const router = useRouter();
  const isSuperAdmin = useAuthStore((s) => s.hasRole("super_admin"));
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      router.replace("/admin");
    }
  }, [isSuperAdmin, router]);

  async function loadTeam(): Promise<void> {
    try {
      const res = await apiClient.get<{ team: TeamMember[] }>("/admin/team");
      setTeam(res.team);
    } catch {
      /* silencieux — la carte reste vide, pas bloquant */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) void loadTeam();
  }, [isSuperAdmin]);

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setAdding(true);
    try {
      await apiClient.post("/admin/team", { phone: phone.trim() });
      setPhone("");
      await loadTeam();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string): Promise<void> {
    setRemovingId(userId);
    try {
      await apiClient.delete(`/admin/team/${userId}`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau");
    } finally {
      setRemovingId(null);
    }
  }

  if (!isSuperAdmin) return null;

  return (
    <main className="min-h-screen bg-page pb-12">
      <AdminHeader title="Équipe" subtitle="Accorder ou retirer l'accès administrateur" />

      <div className="px-4 md:px-8 mt-5 md:mt-8 md:max-w-2xl space-y-4">
        {/* Ajouter un admin */}
        <div className="bg-surface-card rounded-2xl p-4 shadow-sm border border-border-subtle">
          <p className="font-jakarta font-bold text-ink text-sm mb-1">Ajouter un administrateur</p>
          <p className="text-xs text-ink-soft mb-3">
            La personne doit déjà avoir un compte VIVRE (s&apos;être connectée au moins une fois).
          </p>
          <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+22670000000"
              required
              className="flex-1 rounded-xl border border-border-subtle bg-surface-card text-ink px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={adding || !phone.trim()}
              className="px-4 py-2.5 bg-[#1A6B3A] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {adding ? "…" : "Ajouter"}
            </button>
          </form>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {/* Liste */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-xs font-bold text-ink-soft uppercase tracking-widest">
            {loading ? "Chargement…" : `${team.length} administrateur${team.length > 1 ? "s" : ""}`}
          </p>
          {team.map((member) => {
            const isSelf = member.id === currentUserId;
            const isMemberSuperAdmin = member.roles.includes("super_admin");
            const name = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.phone;
            return (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3 border-t border-border-subtle">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {name} {isSelf && <span className="text-ink-soft font-normal">(vous)</span>}
                  </p>
                  <p className="text-xs text-ink-soft">{member.phone}</p>
                </div>
                <span
                  className={[
                    "text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full",
                    isMemberSuperAdmin ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "bg-green-50 dark:bg-green-950/40 text-[#1A6B3A] dark:text-green-300",
                  ].join(" ")}
                >
                  {isMemberSuperAdmin ? "Super admin" : "Admin"}
                </span>
                {!isMemberSuperAdmin && (
                  <button
                    onClick={() => void handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="text-xs text-red-600 font-medium disabled:opacity-50"
                  >
                    {removingId === member.id ? "…" : "Retirer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
