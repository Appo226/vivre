"use client";

/**
 * components/HeroBanner.tsx — Bannière du hero de l'accueil, contenu propre à VIVRE.
 *
 * Contrairement au carrousel qu'elle remplace, ceci n'est jamais une pub tierce payante —
 * juste un visuel (image ou vidéo) que l'admin change de temps en temps depuis
 * /admin/parametres (voir hero_banner_* dans PlatformSettings). Le fond vert de marque du
 * hero reste inchangé : cette bannière s'ajoute dedans, elle ne le remplace pas.
 */

interface HeroBannerProps {
  enabled: boolean;
  imageUrl: string | null;
  mediaType: string;
  linkUrl: string | null;
}

export function HeroBanner({ enabled, imageUrl, mediaType, linkUrl }: HeroBannerProps): React.ReactElement | null {
  if (!enabled || !imageUrl) return null;

  const content = (
    <>
      {mediaType === "video" ? (
        <video src={imageUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- visuel géré par l'admin, pas dans /public
        <img src={imageUrl} alt="VIVRE" className="w-full h-full object-cover" />
      )}
    </>
  );

  const className = "mt-5 -mx-4 relative h-32 overflow-hidden rounded-2xl block";

  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
