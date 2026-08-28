/**
 * GET /api/notifications — Historique des notifications in-app de la personne connectée.
 * Pagination par curseur (id de la dernière notification reçue), 20 par page.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const cursor = request.nextUrl.searchParams.get("cursor");

  const notifications = await prisma.notification.findMany({
    where: { user_id: auth.sub },
    select: {
      id: true, type: true, title: true, body: true,
      is_read: true, sent_at: true, data: true,
    },
    orderBy: { sent_at: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = notifications.length > PAGE_SIZE;
  const page = hasMore ? notifications.slice(0, PAGE_SIZE) : notifications;

  return NextResponse.json({
    notifications: page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      is_read: n.is_read,
      sent_at: n.sent_at.toISOString(),
      data: n.data as Record<string, string> | null,
    })),
    next_cursor: hasMore ? page[page.length - 1]!.id : null,
  });
}
