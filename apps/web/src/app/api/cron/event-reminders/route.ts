/**
 * GET /api/cron/event-reminders — Rappelle aux détenteurs de billets que leur événement approche.
 *
 * Déclenché une fois par jour par Vercel Cron (voir apps/web/vercel.json — le plan Hobby
 * n'autorise pas une fréquence plus fine). Fenêtre volontairement large (12h-36h avant le
 * début) pour ne rater personne entre deux passages quotidiens du job, tout en ne rappelant
 * qu'une fois grâce à reminder_sent_at.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, "UNAUTHORIZED", "Accès réservé au cron");
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const bookings = await prisma.eventBooking.findMany({
    where: {
      status: "confirmed",
      reminder_sent_at: null,
      event: { starts_at: { gte: windowStart, lte: windowEnd } },
    },
    select: {
      id: true,
      user_id: true,
      event: { select: { id: true, title: true, starts_at: true } },
    },
  });

  let sent = 0;
  for (const booking of bookings) {
    const timeLabel = booking.event.starts_at.toLocaleString("fr-FR", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Ouagadougou",
    });

    await notify({
      userId: booking.user_id,
      type: "event_reminder",
      title: "Votre événement approche",
      body: `${booking.event.title} commence ${timeLabel} — préparez votre billet !`,
      data: { event_id: booking.event.id, booking_id: booking.id },
    });

    await prisma.eventBooking.update({
      where: { id: booking.id },
      data: { reminder_sent_at: now },
    });

    sent += 1;
  }

  return NextResponse.json({ message: "Rappels traités", reminders_sent: sent });
}
