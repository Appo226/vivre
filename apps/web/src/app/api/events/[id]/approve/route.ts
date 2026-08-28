/**
 * PATCH /api/events/[id]/approve — Approuver un événement payant (admin uniquement).
 *
 * Si l'organisateur a ajouté une publicité à la soumission (pending_ad_*, déjà payée avec
 * les frais de mise en ligne — voir events/[id]/submit), c'est ICI qu'elle devient une vraie
 * AdCampaign active — jamais avant, même déjà payée, pour ne jamais promouvoir un événement
 * pas encore validé par un admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { sendEmail, eventApprovedEmail } from "@/lib/email";
import { sendOrangeSms } from "@/lib/otp-channel";
import { notify } from "@/lib/notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const { id } = params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      title: true,
      slug: true,
      pending_ad_media_url: true,
      pending_ad_media_type: true,
      pending_ad_days: true,
      pending_ad_price_fcfa: true,
      organizer: { select: { id: true, phone: true, email: true } },
    },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.status !== "pending_approval") {
    return apiError(409, "INVALID_STATUS", `Impossible d'approuver un événement en statut "${event.status}"`);
  }

  await prisma.event.update({
    where: { id },
    data: {
      status: "approved",
      approved_by: auth.sub,
      approved_at: new Date(),
      // Consommée ci-dessous si présente — jamais laissée traîner une fois l'événement décidé.
      pending_ad_media_url: null,
      pending_ad_media_type: null,
      pending_ad_days: null,
      pending_ad_price_fcfa: null,
    },
  });

  if (event.pending_ad_media_url && event.pending_ad_media_type && event.pending_ad_days && event.pending_ad_price_fcfa !== null) {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + event.pending_ad_days * 24 * 60 * 60 * 1000);
    await prisma.adCampaign.create({
      data: {
        advertiser_id: event.organizer.id,
        title: `Événement — ${event.title}`,
        image_url: event.pending_ad_media_url,
        media_type: event.pending_ad_media_type, // déjà "image" | "video" — même vocabulaire que AdCampaign
        link_url: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/${event.slug}`,
        placement: "home_feed",
        start_date: startDate,
        end_date: endDate,
        price_fcfa: event.pending_ad_price_fcfa,
        status: "paid", // déjà réglée avec les frais de mise en ligne
        approved_by: auth.sub,
        approved_at: new Date(),
        paid_at: new Date(),
      },
    });
  }

  void notify({
    userId: event.organizer.id,
    type: "event_approved",
    title: "Votre événement est approuvé",
    body: `${event.title} est maintenant visible et en vente.`,
    data: { event_id: id, slug: event.slug },
  });

  sendOrangeSms(
    event.organizer.phone,
    `VIVRE : "${event.title}" est approuvé et visible sur l'app.`
  ).catch(() => {});

  void sendEmail({
    to: event.organizer.email,
    subject: `${event.title} est approuvé`,
    html: eventApprovedEmail({
      eventTitle: event.title,
      eventUrl: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/${event.slug}`,
    }),
  });

  return NextResponse.json({ message: "Événement approuvé", event_id: id });
}
