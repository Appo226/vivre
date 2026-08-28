/**
 * GET /api/events/mine — Événements de l'organisateur connecté.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1") || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: { organizer_id: auth.sub, deleted_at: null },
      select: {
        id: true,
        title: true,
        slug: true,
        cover_url: true,
        starts_at: true,
        ends_at: true,
        status: true,
        is_featured: true,
        rejection_reason: true,
        city: { select: { name: true } },
        category: { select: { name: true, icon: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.event.count({ where: { organizer_id: auth.sub, deleted_at: null } }),
  ]);

  type OwnedEvent = (typeof events)[number];
  return NextResponse.json({
    events: events.map((e: OwnedEvent) => ({
      ...e,
      starts_at: e.starts_at.toISOString(),
      ends_at: e.ends_at.toISOString(),
      bookings_count: e._count.bookings,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
