"use client";

/**
 * components/SponsoredSection.tsx — Section publicitaire tierce de l'accueil (placement "home_feed").
 *
 * Volontairement hors du hero (voir HeroBanner) : le hero reste l'identité VIVRE, cette
 * section est l'espace vendu à n'importe quel annonceur — pas forcément lié à un événement
 * ou même à la billetterie (banque, mariage, santé, communication publique...). Rendue comme
 * sa propre carte blanche, entre "À l'affiche" et "Organisez votre événement", pour qu'elle
 * ne se confonde jamais avec le contenu propre à VIVRE au-dessus.
 *
 * Transition : fondu + zoom (la carte qui devient inactive rétrécit légèrement en
 * disparaissant, celle qui devient active grandit légèrement en apparaissant) — pas un
 * scroll horizontal. Version précédente utilisait scrollIntoView() + un carrousel scrollable,
 * dont les événements onScroll intermédiaires (déclenchés par l'animation smooth elle-même)
 * pouvaient être mal interprétés comme un swipe manuel et annuler silencieusement l'avancée
 * automatique — un vrai bug vécu en prod. Empiler les cartes en absolu et transitionner
 * opacity/scale élimine complètement cette classe de bug (plus de scroll du tout à
 * distinguer d'un swipe) et donne un rendu plus soigné qu'un slide brut.
 *
 * Carrousel swipeable ET auto-rotatif — mais le minuteur fixe (AUTO_ADVANCE_MS) ne sert QUE
 * pour les photos, qui n'ont pas de durée propre. Une vidéo a déjà son propre temps — elle
 * joue une fois en entier (pas de loop) et c'est SA fin (onEnded), pas un minuteur arbitraire,
 * qui déclenche le passage à l'annonceur suivant. Ça évite de couper une vidéo payée en plein
 * milieu simplement parce que 5s se sont écoulées, tout en gardant un rythme pour les photos
 * qui, elles, n'ont aucun signal naturel de "fin". /publicite/creer plafonne déjà la durée
 * d'upload vidéo (MAX_VIDEO_SECONDS = 15s) — donc aucune pub ne peut monopoliser
 * indéfiniment le carrousel. Une interaction manuelle (swipe, tap sur un point) met
 * l'auto-rotation en pause pendant RESUME_AFTER_MS avant de reprendre, pour ne jamais couper
 * la personne en pleine lecture. Le cadre est un 16:9 fixe et le visuel le remplit entièrement
 * (`object-cover`, jamais de bande grise) — c'est pour ça que /publicite/creer exige et
 * vérifie ce ratio (1200×675) à l'envoi. Rendue en carte — coins arrondis, fine bordure —
 * pour matcher le langage visuel des cartes événement au-dessus ("À l'affiche"), pas en
 * plein bord comme le hero.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface SponsoredAd {
  id: string;
  title: string;
  image_url: string;
  media_type: string;
  link_url: string | null;
}

const AUTO_ADVANCE_MS = 5000; // Durée d'affichage d'une photo — les vidéos ignorent ce chiffre.
const RESUME_AFTER_MS = 8000;
const SWIPE_THRESHOLD_PX = 40;
/*
 * Une pub démarre/s'arrête toute seule selon start_date/end_date (voir /api/ads/active) —
 * mais la home est un Server Component rendu une fois par navigation ("force-dynamic",
 * donc à jour à CHAQUE chargement de page). Sans re-fetch côté client, quelqu'un qui garde
 * l'app ouverte plus longtemps que la fenêtre d'une pub continue de la voir tourner dans le
 * carrousel après sa fin, et ne voit jamais une nouvelle pub démarrer — jusqu'au prochain
 * rechargement complet. Ce polling comble cet écart sans dépendre d'une navigation.
 */
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

function trackClick(adId: string): void {
  void fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
}

export function SponsoredSection({ ads: initialAds }: { ads: SponsoredAd[] }): React.ReactElement | null {
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data } = useQuery({
    queryKey: ["ads-active", "home_feed"],
    queryFn: () => apiClient.get<{ campaigns: SponsoredAd[] }>("/ads/active?placement=home_feed"),
    initialData: { campaigns: initialAds },
    staleTime: 0,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const ads = data.campaigns;

  /* La liste peut rétrécir (une pub expire) ou changer d'ordre entre deux refetch — sans ce
   * clamp, activeIndex pourrait pointer au-delà de la nouvelle longueur et casser le rendu. */
  useEffect(() => {
    if (activeIndex >= ads.length && ads.length > 0) setActiveIndex(0);
  }, [ads.length, activeIndex]);

  function advance(): void {
    setActiveIndex((i) => (i + 1) % ads.length);
  }

  /* Minuteur fixe UNIQUEMENT pour l'annonceur actif s'il s'agit d'une photo — une vidéo
     avance toute seule via son propre onEnded (voir le <video> plus bas), jamais ici. */
  useEffect(() => {
    if (ads.length <= 1 || paused) return;
    if (ads[activeIndex]?.media_type === "video") return;
    const id = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads, activeIndex, paused]);

  /* Relance la vidéo de la carte qui redevient active — si elle avait déjà fini (tour complet
     du carrousel), on la reprend depuis le début plutôt que de retomber sur son image figée. */
  useEffect(() => {
    const video = slideRefs.current[activeIndex]?.querySelector("video") ?? null;
    if (!video) return;
    const tryPlay = (): void => { void video.play().catch(() => {}); };
    if (video.ended) {
      // Appeler play() juste après currentTime=0 échouerait en silence (le seek est
      // asynchrone et interrompt un play() immédiat) : on attend "seeked" d'abord.
      video.addEventListener("seeked", tryPlay, { once: true });
      video.currentTime = 0;
    } else {
      tryPlay();
    }
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  if (ads.length === 0) return null;

  /* Toute interaction manuelle met l'auto-rotation en pause, puis la relance après un délai. */
  function pauseAutoAdvance(): void {
    setPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }

  function handlePointerDown(e: React.PointerEvent): void {
    swipeStartXRef.current = e.clientX;
    pauseAutoAdvance();
  }

  function handlePointerUp(e: React.PointerEvent): void {
    const startX = swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (startX === null || ads.length <= 1) return;
    const delta = e.clientX - startX;
    if (delta > SWIPE_THRESHOLD_PX) {
      setActiveIndex((i) => (i - 1 + ads.length) % ads.length);
    } else if (delta < -SWIPE_THRESHOLD_PX) {
      setActiveIndex((i) => (i + 1) % ads.length);
    }
  }

  return (
    <section className="px-4 mb-6">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Sponsorisé</p>

      <div className="relative overflow-hidden rounded-2xl border border-gray-100 dark:border-dark-700 shadow-card">
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className="relative aspect-video touch-pan-y"
        >
          {ads.map((ad, i) => {
            const isActive = i === activeIndex;
            const media = (
              <>
                {ad.media_type === "video" ? (
                  <video
                    src={ad.image_url}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                    onEnded={() => { if (i === activeIndex && !paused) advance(); }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- créative externe, pas dans /public
                  <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                )}
                {ad.link_url && (
                  <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 bg-[#1A6B3A] text-white text-xs font-jakarta font-bold px-3 py-1.5 rounded-full shadow-md">
                    En savoir plus
                    <span aria-hidden="true">→</span>
                  </span>
                )}
              </>
            );
            const className = [
              "absolute inset-0 block transition-[opacity,transform] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              isActive ? "opacity-100 scale-100 z-10" : "opacity-0 scale-95 z-0 pointer-events-none",
            ].join(" ");
            // Pas tous les annonceurs n'ont un lien — une pub sans link_url s'affiche mais ne
            // mène nulle part (pas de <a>, pas de tracking de clic qui n'aurait pas de sens).
            return ad.link_url ? (
              <a
                key={ad.id}
                ref={(el) => { slideRefs.current[i] = el; }}
                href={ad.link_url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                title={ad.title}
                onClick={() => trackClick(ad.id)}
                className={className}
              >
                {media}
              </a>
            ) : (
              <div key={ad.id} ref={(el) => { slideRefs.current[i] = el; }} title={ad.title} className={className}>
                {media}
              </div>
            );
          })}
        </div>

        {ads.length > 1 && (
          <div className="absolute top-2.5 right-2.5 flex gap-1.5 z-20">
            {ads.map((ad, i) => (
              <button
                key={ad.id}
                type="button"
                aria-label={`Publicité ${i + 1}`}
                onClick={() => { pauseAutoAdvance(); setActiveIndex(i); }}
                className={[
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === activeIndex ? "bg-white w-4" : "bg-white/50",
                ].join(" ")}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
