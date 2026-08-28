/**
 * evenements/[id]/page.tsx — Server Component wrapper for EV_002.
 *
 * Le SEUL rôle de ce fichier est de générer les balises Open Graph / Twitter Card côté
 * serveur, à partir des vraies données de l'événement — indispensable pour que WhatsApp,
 * Instagram, Facebook ou X affichent une carte de prévisualisation (photo + titre + lieu)
 * quand un lien d'événement est partagé. Les crawlers de ces plateformes n'exécutent PAS
 * de JavaScript, donc un <title> mis à jour côté client (comme le composant l'était avant)
 * est invisible pour eux — generateMetadata() doit tourner côté serveur.
 *
 * C'est le levier de croissance organique le plus direct pour une billetterie de type
 * Posh : chaque billet partagé sur WhatsApp doit donner envie de cliquer.
 */

import type { Metadata } from "next";
import { prisma } from "@vivre/database";
import EventDetailClient from "./EventDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

async function getEventForMetadata(id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return prisma.event.findFirst({
    where: { ...(isUuid ? { id } : { slug: id }), deleted_at: null },
    select: {
      title: true,
      description: true,
      cover_url: true,
      venue_name: true,
      starts_at: true,
      city: { select: { name: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await getEventForMetadata(params.id);
  if (!event) {
    return { title: "Événement introuvable — VIVRE" };
  }

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", timeZone: "UTC",
  }).format(event.starts_at);
  const description = `${dateLabel} · ${event.venue_name}, ${event.city.name} — ${event.description.slice(0, 150)}`;
  const title = `${event.title} — VIVRE`;

  return {
    title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      ...(event.cover_url && { images: [{ url: event.cover_url, width: 800, height: 500, alt: event.title }] }),
    },
    twitter: {
      card: event.cover_url ? "summary_large_image" : "summary",
      title: event.title,
      description,
      ...(event.cover_url && { images: [event.cover_url] }),
    },
  };
}

export default function EventDetailPage(): React.ReactElement {
  return <EventDetailClient />;
}
