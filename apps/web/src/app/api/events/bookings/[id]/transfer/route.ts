/**
 * PATCH /api/events/bookings/[id]/transfer — Céder son billet à un autre utilisateur.
 *
 * `user_id` sur EventBooking fait autorité pour la propriété actuelle (voir GET/DELETE
 * de ce billet, /events/bookings/me, et le scan à l'entrée) — le réassigner suffit à
 * transférer intégralement le billet : il disparaît instantanément de la liste et de
 * l'accès de l'ancien propriétaire, apparaît chez le nouveau, et le QR (qui n'encode
 * l'ancien propriétaire que pour information — le scan valide par booking.id, pas par
 * l'utilisateur encodé) continue de fonctionner sans avoir besoin d'être régénéré.
 * `transferred_to_id`/`transferred_at` restent comme trace d'audit du transfert.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { TransferBookingSchema } from "@/lib/schemas/events";
import { sendEmail, ticketTransferredEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = TransferBookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Numéro de téléphone du destinataire invalide", parsed.error.errors[0]?.message);
  }
  const { recipient_phone: recipientPhone } = parsed.data;

  if (recipientPhone === auth.phone) {
    return apiError(422, "SELF_TRANSFER", "Vous ne pouvez pas transférer un billet à vous-même");
  }

  const booking = await prisma.eventBooking.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      user_id: true,
      status: true,
      event: { select: { starts_at: true, title: true } },
    },
  });
  if (!booking) {
    return apiError(404, "BOOKING_NOT_FOUND", "Billet introuvable");
  }
  if (booking.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Seul le détenteur actuel du billet peut le transférer");
  }
  if (booking.status !== "confirmed") {
    return apiError(
      409,
      "INVALID_STATUS",
      booking.status === "checked_in"
        ? "Ce billet a déjà été utilisé — impossible à transférer"
        : "Seul un billet confirmé peut être transféré"
    );
  }
  if (new Date(booking.event.starts_at) <= new Date()) {
    return apiError(409, "EVENT_STARTED", "L'événement a déjà commencé — transfert impossible");
  }

  // Le destinataire n'a pas forcément de compte VIVRE — on lui en crée un a minima,
  // comme le fait déjà /api/auth/verify-otp au premier login. Il obtiendra le rôle
  // "customer" automatiquement à sa première connexion (même logique là-bas).
  const recipient = await prisma.user.upsert({
    where: { phone: recipientPhone },
    update: {},
    create: { phone: recipientPhone, preferred_language: "fr", is_active: true },
    select: { id: true, is_active: true, email: true },
  });

  if (!recipient.is_active) {
    return apiError(403, "RECIPIENT_SUSPENDED", "Ce compte destinataire est désactivé");
  }

  await prisma.eventBooking.update({
    where: { id: params.id },
    data: { user_id: recipient.id, transferred_to_id: recipient.id, transferred_at: new Date() },
  });

  void notify({
    userId: recipient.id,
    type: "ticket_transferred",
    title: "Vous avez reçu un billet",
    body: `Un billet pour ${booking.event.title} vous a été transféré.`,
    data: { booking_id: params.id },
  });

  // Best-effort — le destinataire n'a souvent pas encore d'email (compte tout juste
  // créé par upsert ci-dessus) ; sendEmail() no-op silencieusement dans ce cas.
  void sendEmail({
    to: recipient.email,
    subject: `Vous avez reçu un billet pour ${booking.event.title}`,
    html: ticketTransferredEmail({
      eventTitle: booking.event.title,
      ticketUrl: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/mes-billets/${params.id}`,
    }),
  });

  return NextResponse.json({ message: `Billet transféré à ${recipientPhone}` });
}
