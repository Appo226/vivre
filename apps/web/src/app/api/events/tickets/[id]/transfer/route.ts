/**
 * PATCH /api/events/tickets/[id]/transfer — Céder UN billet précis à un autre utilisateur.
 *
 * Opère sur un seul EventTicket, pas sur toute la commande — un acheteur de 4 billets peut
 * en céder un seul à un ami sans toucher aux 3 autres. `user_id` sur EventTicket fait
 * autorité pour la propriété actuelle de CE billet ; le réassigner suffit à le transférer
 * intégralement (il disparaît instantanément de la liste et de l'accès de l'ancien détenteur,
 * apparaît chez le nouveau), le QR continue de fonctionner sans être régénéré.
 * `transferred_to_id`/`transferred_at` restent comme trace d'audit du dernier transfert.
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

  const ticket = await prisma.eventTicket.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      booking_id: true,
      user_id: true,
      status: true,
      event: { select: { starts_at: true, title: true } },
    },
  });
  if (!ticket) {
    return apiError(404, "TICKET_NOT_FOUND", "Billet introuvable");
  }
  if (ticket.user_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Seul le détenteur actuel du billet peut le transférer");
  }
  if (ticket.status !== "valid") {
    return apiError(
      409,
      "INVALID_STATUS",
      ticket.status === "checked_in"
        ? "Ce billet a déjà été utilisé — impossible à transférer"
        : "Seul un billet actif peut être transféré"
    );
  }
  if (new Date(ticket.event.starts_at) <= new Date()) {
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

  await prisma.eventTicket.update({
    where: { id: params.id },
    data: { user_id: recipient.id, transferred_to_id: recipient.id, transferred_at: new Date() },
  });

  void notify({
    userId: recipient.id,
    type: "ticket_transferred",
    title: "Vous avez reçu un billet",
    body: `Un billet pour ${ticket.event.title} vous a été transféré.`,
    data: { ticket_id: params.id },
  });

  // Best-effort — le destinataire n'a souvent pas encore d'email (compte tout juste
  // créé par upsert ci-dessus) ; sendEmail() no-op silencieusement dans ce cas.
  void sendEmail({
    to: recipient.email,
    subject: `Vous avez reçu un billet pour ${ticket.event.title}`,
    html: ticketTransferredEmail({
      eventTitle: ticket.event.title,
      ticketUrl: `${process.env["APP_URL"] ?? "https://vivrebf.com"}/evenements/mes-billets/${params.id}`,
    }),
  });

  return NextResponse.json({ message: `Billet transféré à ${recipientPhone}` });
}
