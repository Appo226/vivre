/**
 * GET /api/events/bookings/me — Mes billets (« upcoming » | « past » | « cancelled » | « all »).
 *
 * Une "commande" ici regroupe les EventTicket que L'APPELANT détient ACTUELLEMENT pour une
 * même EventBooking — pas la commande telle qu'achetée à l'origine. Après un transfert
 * partiel (voir /api/events/tickets/[id]/transfer), l'acheteur d'origine peut ne plus détenir
 * que 3 des 4 billets qu'il a achetés, et le destinataire du transfert voit apparaître ici SA
 * propre entrée pour cette même commande avec son seul billet. Les commandes encore "pending"
 * (payées mais pas encore confirmées, donc sans aucun EventTicket émis) sont ajoutées à part,
 * car il n'y a encore rien à "détenir".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

interface OrderSummary {
  id: string; // booking_id — sert de clé de navigation vers /evenements/mes-billets/[id]
  quantity: number; // nombre de billets que JE détiens actuellement dans cette commande
  total_amount: number;
  status: string;
  created_at: string;
  checked_in_at: string | null;
  ticket_type: { name: string; price_fcfa: number };
  event: {
    id: string;
    title: string;
    cover_url: string | null;
    starts_at: string;
    ends_at: string;
    venue_name: string;
    city: { name: string };
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const filter = request.nextUrl.searchParams.get("filter") ?? "all";
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1") || 1;
  const limit = 10;
  const now = new Date();

  const eventSelect = {
    id: true,
    title: true,
    cover_url: true,
    starts_at: true,
    ends_at: true,
    venue_name: true,
    city: { select: { name: true } },
  } as const;

  // Commandes payantes encore en attente de paiement — pas de billet émis, rien à "détenir"
  // encore, donc pas couvert par la requête EventTicket ci-dessous.
  const pendingBookings = filter === "cancelled"
    ? []
    : await prisma.eventBooking.findMany({
        where: { user_id: auth.sub, status: "pending" },
        select: {
          id: true, quantity: true, total_amount: true, status: true, created_at: true,
          ticket_type: { select: { name: true, price_fcfa: true } },
          event: { select: eventSelect },
        },
      });

  // Billets que je détiens actuellement (achetés par moi, ou reçus par transfert) — groupés
  // par commande pour l'affichage. status="cancelled" filtré à part car un billet annulé
  // individuellement ne doit apparaître que dans l'onglet "Annulés", jamais mélangé à des
  // billets encore actifs de la même commande.
  const myTickets = await prisma.eventTicket.findMany({
    where: {
      user_id: auth.sub,
      status: filter === "cancelled" ? "cancelled" : { not: "cancelled" },
    },
    select: {
      status: true,
      checked_in_at: true,
      booking: {
        select: {
          id: true, total_amount: true, quantity: true, created_at: true,
          ticket_type: { select: { name: true, price_fcfa: true } },
          event: { select: eventSelect },
        },
      },
    },
    orderBy: { booking: { created_at: "desc" } },
  });

  const groups = new Map<string, OrderSummary & { _statuses: Set<string> }>();
  for (const t of myTickets) {
    const b = t.booking;
    const existing = groups.get(b.id);
    if (existing) {
      existing.quantity += 1;
      existing._statuses.add(t.status);
      if (t.checked_in_at && !existing.checked_in_at) existing.checked_in_at = t.checked_in_at.toISOString();
    } else {
      groups.set(b.id, {
        id: b.id,
        quantity: 1,
        total_amount: b.total_amount,
        status: t.status, // affiné juste après si les billets de cette commande ont des statuts mêlés
        created_at: b.created_at.toISOString(),
        checked_in_at: t.checked_in_at?.toISOString() ?? null,
        ticket_type: b.ticket_type,
        event: {
          ...b.event,
          starts_at: b.event.starts_at.toISOString(),
          ends_at: b.event.ends_at.toISOString(),
        },
        _statuses: new Set([t.status]),
      });
    }
  }

  const ticketGroups: OrderSummary[] = Array.from(groups.values()).map(({ _statuses, ...g }) => ({
    ...g,
    // "confirmed" si au moins un billet actif reste, "checked_in" si tous scannés — juste
    // pour l'affichage de la carte, le détail par billet vit sur la page de la commande.
    status: _statuses.has("valid") ? "confirmed" : _statuses.has("checked_in") ? "checked_in" : "cancelled",
  }));

  let combined: OrderSummary[] = [
    ...pendingBookings.map((b): OrderSummary => ({
      id: b.id,
      quantity: b.quantity,
      total_amount: b.total_amount,
      status: b.status,
      created_at: b.created_at.toISOString(),
      checked_in_at: null,
      ticket_type: b.ticket_type,
      event: {
        ...b.event,
        starts_at: b.event.starts_at.toISOString(),
        ends_at: b.event.ends_at.toISOString(),
      },
    })),
    ...ticketGroups,
  ];

  if (filter === "upcoming") {
    combined = combined.filter((o) => new Date(o.event.starts_at) > now && o.status !== "cancelled");
  } else if (filter === "past") {
    combined = combined.filter((o) => new Date(o.event.starts_at) <= now);
  } else if (filter === "cancelled") {
    combined = combined.filter((o) => o.status === "cancelled");
  }

  combined.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = combined.length;
  const offset = (page - 1) * limit;
  const pageItems = combined.slice(offset, offset + limit);

  return NextResponse.json({
    bookings: pageItems,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
