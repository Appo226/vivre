/**
 * GET /api/events/bookings/me — Mes billets (« upcoming » | « past » | « cancelled » | « all »).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const filter = request.nextUrl.searchParams.get("filter") ?? "all";
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1") || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const now = new Date();

  type WhereFilter = {
    user_id: string;
    status?: string | { in: string[] };
    event?: { starts_at?: { gt?: Date; lte?: Date } };
  };
  const where: WhereFilter = { user_id: auth.sub };
  if (filter === "upcoming") {
    where.status = { in: ["pending", "confirmed"] };
    where.event = { starts_at: { gt: now } };
  } else if (filter === "past") {
    where.event = { starts_at: { lte: now } };
  } else if (filter === "cancelled") {
    where.status = "cancelled";
  }

  const [bookings, total] = await Promise.all([
    prisma.eventBooking.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        total_amount: true,
        status: true,
        created_at: true,
        checked_in_at: true,
        ticket_type: { select: { name: true, price_fcfa: true } },
        event: {
          select: {
            id: true,
            title: true,
            cover_url: true,
            starts_at: true,
            ends_at: true,
            venue_name: true,
            city: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.eventBooking.count({ where }),
  ]);

  type MyBooking = (typeof bookings)[number];
  return NextResponse.json({
    bookings: bookings.map((b: MyBooking) => ({
      id: b.id,
      quantity: b.quantity,
      total_amount: b.total_amount,
      status: b.status,
      created_at: b.created_at.toISOString(),
      checked_in_at: b.checked_in_at?.toISOString() ?? null,
      ticket_type: b.ticket_type,
      event: {
        ...b.event,
        starts_at: b.event.starts_at.toISOString(),
        ends_at: b.event.ends_at.toISOString(),
      },
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
