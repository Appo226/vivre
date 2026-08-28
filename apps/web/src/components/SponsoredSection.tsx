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
 * Carrousel glissable ET auto-rotatif — mais le minuteur fixe (AUTO_ADVANCE_MS) ne sert
 * QUE pour les photos, qui n'ont pas de durée propre. Une vidéo a déjà son propre temps —
 * elle joue une fois en entier (pas de loop) et c'est SA fin (onEnded), pas un minuteur
 * arbitraire, qui déclenche le passage à l'annonceur suivant. Ça évite de couper une vidéo
 * payée en plein milieu simplement parce que 5s se sont écoulées, tout en gardant un rythme
 * pour les photos qui, elles, n'ont aucun signal naturel de "fin". /publicite/creer plafonne
 * déjà la durée d'upload vidéo (MAX_VIDEO_SECONDS = 15s) — donc aucune pub ne peut monopoliser
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * scrollIntoView({behavior:"smooth"}) fires many intermediate onScroll events while it
   * animates — handleScroll (built to detect a real manual swipe) was recomputing
   * activeIndex from the rounded in-flight scroll position on EVERY one of those events,
   * which for most of the transit distance rounds back to the OLD index, silently
   * overwriting the very index change that triggered the scroll. Since that old video had
   * already ended, the restart-from-ended-video logic below then replayed it — looked
   * exactly like "the same video loops instead of advancing." This flag makes handleScroll
   * ignore scroll events we triggered ourselves; only a real user swipe should move the index.
   */
  const programmaticScrollRef = useRef(false);
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function scrollToIndex(index: number): void {
    const el = scrollRef.current;
    const target = el?.children[index];
    if (target instanceof HTMLElement) {
      programmaticScrollRef.current = true;
      if (scrollSettleTimeoutRef.current) clearTimeout(scrollSettleTimeoutRef.current);
      // Filet de sécurité si "scrollend" n'est pas déclenché/supporté — une transition smooth
      // ne dépasse jamais ~500ms en pratique, largement de la marge.
      scrollSettleTimeoutRef.current = setTimeout(() => { programmaticScrollRef.current = false; }, 600);
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

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

  /* Fait défiler physiquement vers activeIndex, que le changement vienne de l'auto-rotation,
     d'un tap sur un point, ou d'un swipe manuel (voir handleScroll). Si l'annonceur qui
     devient actif est une vidéo, la relance depuis le début — sinon on retomberait sur
     l'image figée de sa dernière lecture (les vidéos ne bouclent plus, voir plus bas). */
  useEffect(() => {
    scrollToIndex(activeIndex);
    const activeEl = scrollRef.current?.children[activeIndex];
    const video = activeEl instanceof HTMLElement ? activeEl.querySelector("video") : null;
    if (video) {
      const tryPlay = (): void => { void video.play().catch(() => {}); };
      if (video.ended) {
        // Retour sur une vidéo déjà terminée (tour complet du carrousel) — la relancer
        // depuis le début. Appeler play() juste après currentTime=0 le ferait échouer en
        // silence (le seek vers 0 est asynchrone et interrompt un play() immédiat) : on
        // attend l'événement "seeked" avant de relancer la lecture.
        video.addEventListener("seeked", tryPlay, { once: true });
        video.currentTime = 0;
      } else {
        // Première apparition — la lecture native (autoPlay) est déjà en cours ou en train
        // de démarrer ; appeler play() ici est un no-op idempotent, pas un redémarrage (le
        // Strict Mode de React double-invoque cet effet, donc ça doit rester sans effet
        // de bord destructeur).
        tryPlay();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
      if (scrollSettleTimeoutRef.current) clearTimeout(scrollSettleTimeoutRef.current);
    };
  }, []);

  /* Signal plus réactif que le filet de sécurité ci-dessus, quand le navigateur le supporte —
   * lève le drapeau dès que le scroll animé s'arrête vraiment, pas après un délai fixe. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScrollEnd = (): void => { programmaticScrollRef.current = false; };
    el.addEventListener("scrollend", onScrollEnd);
    return () => el.removeEventListener("scrollend", onScrollEnd);
  }, []);

  if (ads.length === 0) return null;

  /* Toute interaction manuelle met l'auto-rotation en pause, puis la relance après un délai. */
  function pauseAutoAdvance(): void {
    setPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }

  function handleScroll(): void {
    if (programmaticScrollRef.current) return; // scroll qu'on a nous-même déclenché — pas un swipe réel
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.max(0, Math.min(ads.length - 1, index)));
  }

  return (
    <section className="px-4 mb-6">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Sponsorisé</p>

      <div className="relative overflow-hidden rounded-2xl border border-gray-100 dark:border-dark-700 shadow-card">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={pauseAutoAdvance}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {ads.map((ad, i) => {
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
            const className = "relative flex-shrink-0 w-full snap-center aspect-video block";
            // Pas tous les annonceurs n'ont un lien — une pub sans link_url s'affiche mais ne
            // mène nulle part (pas de <a>, pas de tracking de clic qui n'aurait pas de sens).
            return ad.link_url ? (
              <a
                key={ad.id}
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
              <div key={ad.id} title={ad.title} className={className}>
                {media}
              </div>
            );
          })}
        </div>

        {ads.length > 1 && (
          <div className="absolute top-2.5 right-2.5 flex gap-1.5">
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
