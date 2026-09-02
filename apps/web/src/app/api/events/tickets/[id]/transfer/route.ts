/**
 * PATCH /api/events/tickets/[id]/transfer — Transfère UN billet précis à un autre numéro,
 * immédiatement, sans étape d'acceptation.
 *
 * Un flux "en attente d'acceptation" a été envisagé puis abandonné : au Burkina Faso, un
 * destinataire peut ne pas avoir de réseau/data pendant des jours — exiger une action de sa
 * part pour que le billet devienne réellement le sien aurait laissé le billet de
 * l'expéditeur bloqué sans qu'il puisse rien y faire. Le transfert est donc instantané et
 * irréversible pour l'expéditeur (comme avant), mais avec deux ajouts réels par rapport à
 * l'ancien flux : un vrai SMS (pas juste un email que le destinataire n'a souvent pas), et
 * un lien magique qui fonctionne même pour quelqu'un sans compte VIVRE — pas de mot de passe
 * à créer, juste le code reçu par le même SMS (voir /transfert/[token] et
 * /api/transfers/[token]).
 *
 * TicketTransfer sert de journal d'audit ("qui a transféré quoi à qui, quand") et porte le
 * token du lien magique — son statut passe directement à "completed" à la création, il n'y a
 * plus d'état "pending" à faire évoluer.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { TransferBookingSchema } from "@/lib/schemas/events";
import { notify } from "@/lib/notifications";
import { sendOrangeSms } from "@/lib/otp-channel";

const MAGIC_LINK_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

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

  const [ticket, sender] = await Promise.all([
    prisma.eventTicket.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        user_id: true,
        status: true,
        event: { select: { starts_at: true, title: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: auth.sub }, select: { first_name: true, last_name: true } }),
  ]);
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

  // Le destinataire n'a pas forcément de compte VIVRE — on lui en crée un a minima, comme le
  // fait déjà /api/auth/verify-otp au premier login. Contrairement à l'ancien flux, on ne
  // compte plus sur un mot de passe pour qu'il y accède : le lien magique (voir plus bas)
  // passe par le même code SMS que la connexion normale, aucun mot de passe requis.
  const recipient = await prisma.user.upsert({
    where: { phone: recipientPhone },
    update: {},
    create: { phone: recipientPhone, preferred_language: "fr", is_active: true },
    select: { id: true, is_active: true },
  });
  if (!recipient.is_active) {
    return apiError(403, "RECIPIENT_SUSPENDED", "Ce compte destinataire est désactivé");
  }

  // Même protection anti-double-transfert concurrent que l'ancien flux (double-tap, deux
  // onglets) — la condition dans le WHERE fait de l'écriture elle-même la source de vérité.
  const { count } = await prisma.eventTicket.updateMany({
    where: { id: params.id, user_id: auth.sub, status: "valid" },
    data: { user_id: recipient.id, transferred_to_id: recipient.id, transferred_at: new Date() },
  });
  if (count === 0) {
    return apiError(409, "TRANSFER_RACE_LOST", "Ce billet vient d'être modifié (scanné ou transféré) — réessayez");
  }

  const transfer = await prisma.ticketTransfer.create({
    data: {
      ticket_id: ticket.id,
      sender_id: auth.sub,
      recipient_phone: recipientPhone,
      recipient_id: recipient.id,
      token: randomUUID(),
      status: "completed",
      expires_at: new Date(Date.now() + MAGIC_LINK_VALIDITY_MS),
      responded_at: new Date(),
    },
    select: { token: true },
  });

  const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ") || auth.phone;
  const transferUrl = `${process.env["APP_URL"] ?? "https://vivrebf.com"}/transfert/${transfer.token}`;

  void notify({
    userId: recipient.id,
    type: "ticket_transferred",
    title: "Vous avez reçu un billet",
    body: `${senderName} vous a transféré un billet pour ${ticket.event.title}.`,
    data: { ticket_id: ticket.id },
  });

  // Best-effort — un SMS manqué ne doit jamais faire échouer un transfert déjà effectué.
  try {
    await sendOrangeSms(
      recipientPhone,
      `${senderName} vous a transféré un billet VIVRE pour "${ticket.event.title}". Consultez-le ici : ${transferUrl}`
    );
  } catch (err) {
    console.error(`[transfer] Échec envoi SMS à ${recipientPhone}:`, err);
  }

  return NextResponse.json({ message: `Billet transféré à ${recipientPhone}` });
}
