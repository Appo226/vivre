/**
 * apps/web/src/app/page.tsx — Accueil VIVRE (billetterie d'événements)
 *
 * VIVRE est désormais un produit de billetterie d'événements (à la Posh),
 * pas un super-app multi-modules. Cette page met en avant :
 * - Les événements à venir (gratuits en tête, aucune friction pour les découvrir)
 * - Les catégories
 * - L'appel à l'action organisateur ("Créer un événement")
 * - Les numéros d'urgence — seul module hors-billetterie jugé essentiel
 *
 * Server Component : les événements sont lus directement via Prisma (même
 * processus Next.js, pas d'aller-retour HTTP interne).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@vivre/database";
import { BottomNav } from "@/components/BottomNav";
import { PatriotStar } from "@/components/PatriotStar";
import { HeaderProfileAvatar } from "@/components/HeaderProfileAvatar";
import { HeroBanner } from "@/components/HeroBanner";
import { SponsoredSection } from "@/components/SponsoredSection";
import { HomeEventsList } from "@/components/HomeEventsList";
import { getPlatformSettings } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "VIVRE — La billetterie des événements du Burkina Faso",
};

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<React.ReactElement> {
  const upcomingWhere = { status: "approved" as const, deleted_at: null, starts_at: { gte: new Date() } };

  const now = new Date();
  const [events, homeAds, platformSettings] = await Promise.all([
    prisma.event.findMany({
      where: upcomingWhere,
      select: {
        id: true,
        title: true,
        slug: true,
        cover_url: true,
        starts_at: true,
        venue_name: true,
        is_featured: true,
        city: { select: { name: true } },
        category: { select: { name: true, icon: true } },
        ticket_types: {
          where: { is_active: true },
          select: { price_fcfa: true },
          orderBy: { price_fcfa: "asc" },
          take: 1,
        },
      },
      orderBy: [{ is_featured: "desc" }, { starts_at: "asc" }],
      take: 8,
    }),
    // Même logique de fenêtre que /api/ads/active — pas de statut "active" stocké, une
    // pub payée démarre/s'arrête toute seule selon start_date/end_date.
    prisma.adCampaign.findMany({
      where: { placement: "home_feed", status: "paid", start_date: { lte: now }, end_date: { gte: now } },
      select: { id: true, title: true, image_url: true, media_type: true, link_url: true },
      orderBy: { created_at: "asc" },
    }),
    getPlatformSettings(),
  ]);
  type HomeEvent = (typeof events)[number];

  if (homeAds.length > 0) {
    void prisma.adCampaign
      .updateMany({ where: { id: { in: homeAds.map((a: { id: string }) => a.id) } }, data: { impressions_count: { increment: 1 } } })
      .catch(() => {});
  }

  // Photos de couverture réelles pour le fond du hero — pas de stock/vidéo générique,
  // ce sont les vraies affiches des événements en ce moment sur la plateforme.
  const backdropPhotos = events
    .map((e: HomeEvent) => e.cover_url)
    .filter((url: string | null): url is string => Boolean(url))
    .slice(0, 4);
  const slideSeconds = 6;

  return (
    <main className="mobile-container min-h-screen pb-safe-bottom">
      {/* === HEADER === */}
      <header className="hero-texture text-white pt-safe-top pb-5 overflow-hidden relative -mx-4 md:-mx-6 px-4 md:px-6">
        {/* Diaporama de vraies affiches d'événements — l'énergie "ça bouge, ça vit"
            vient du catalogue réel, pas d'une vidéo de stock générique. */}
        {backdropPhotos.length > 0 && (
          <div className="absolute inset-0" aria-hidden="true">
            {backdropPhotos.map((url: string, i: number) => (
              <div
                key={url}
                className="absolute inset-0 bg-cover bg-center animate-photo-crossfade"
                style={{
                  backgroundImage: `url(${url})`,
                  animationDuration: `${backdropPhotos.length * slideSeconds}s`,
                  animationDelay: `${i * slideSeconds}s`,
                }}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0F2E20]/80 via-[#0F2E20]/88 to-[#0F2E20]" />
          </div>
        )}

        {/* Contenu — position:relative pour peindre au-dessus du diaporama photo absolu */}
        <div className="relative pt-4">
          <HeaderProfileAvatar />

          <h1 className="animate-slide-up font-sora font-extrabold text-[28px] leading-[1.15] mb-1.5 text-balance">
            Vivez le Faso.
            <br />
            Un billet à la fois.
          </h1>
          <p className="animate-slide-up font-dm text-white/70 text-sm mb-5" style={{ animationDelay: "60ms" }}>
            {platformSettings.home_subtitle}
          </p>

          <Link
            href="/evenements"
            className="flex items-center gap-2 bg-surface-card rounded-full px-4 py-3 text-ink-soft font-dm text-sm shadow-modal hover:bg-white/95 transition-colors"
          >
            <span aria-hidden="true" className="text-[#F5A623]">🔍</span>
            Rechercher un événement, un lieu…
          </Link>

          <HeroBanner
            enabled={platformSettings.hero_banner_enabled}
            imageUrl={platformSettings.hero_banner_image_url}
            mediaType={platformSettings.hero_banner_media_type}
            linkUrl={platformSettings.hero_banner_link_url}
          />
        </div>
      </header>

      {/* Bande de losanges tricolores — signature visuelle VIVRE, pas un simple filet */}
      <div className="brand-pattern h-3.5 -mx-4 md:-mx-6" />

      {/* === SECTION SPONSORISÉE — tiers annonceurs, hors identité VIVRE (voir HeroBanner) === */}
      <div className="pt-5">
        <SponsoredSection ads={homeAds} />
      </div>

      {/* === ÉVÉNEMENTS À VENIR === */}
      <section className="pb-4">
        <div className="flex items-center gap-2 mb-4">
          <PatriotStar className="w-4 h-4" />
          <h2 className="font-sora font-bold text-ink">À l&apos;affiche</h2>
        </div>

        <HomeEventsList events={events} />
      </section>

      {/* === ORGANISER UN ÉVÉNEMENT === */}
      <section className="mb-6">
        <Link
          href="/evenements/publier"
          className="flex items-center gap-3 p-4 rounded-card bg-dark text-white hover:bg-dark-700 transition-colors"
        >
          <span className="text-2xl">🎟️</span>
          <div>
            <p className="font-jakarta font-bold text-sm">Organisez votre événement</p>
            <p className="text-white/60 text-xs font-dm">Gratuit pour les billets gratuits — publié en quelques minutes</p>
          </div>
          <span className="ml-auto text-white/60">›</span>
        </Link>
      </section>

      {/* === PUBLICITÉ — n'importe quel compte connecté peut soumettre une campagne === */}
      <section className="mb-6">
        <Link
          href="/publicite/creer"
          className="flex items-center gap-3 p-4 rounded-card bg-surface-card border border-border-subtle hover:bg-surface-elevated transition-colors"
        >
          <span className="text-2xl">📣</span>
          <div>
            <p className="font-jakarta font-bold text-sm text-ink">Annoncez sur VIVRE</p>
            <p className="text-ink-soft text-xs font-dm">Touchez les fans d&apos;événements du Burkina — soumettez votre pub</p>
          </div>
          <span className="ml-auto text-ink-soft">›</span>
        </Link>
      </section>

      {/* === URGENCES (toujours visible — utilité publique, hors billetterie) === */}
      <section className="mb-6">
        <Link
          href="/urgences"
          className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-card hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
        >
          <span className="text-2xl">🆘</span>
          <div>
            <p className="font-jakarta font-bold text-red-700 dark:text-red-300 text-sm">Numéros d&apos;urgence</p>
            <p className="text-red-500 dark:text-red-400 text-xs font-dm">SAMU 15 · Police 17 · Pompiers 18</p>
          </div>
          <span className="ml-auto text-red-400">›</span>
        </Link>
      </section>

      <div className="h-bottom-nav" aria-hidden="true" />
      <BottomNav />
    </main>
  );
}
