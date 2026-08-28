/**
 * PATCH /api/notifications/read-all — Marque toutes les notifications non lues
 * de la personne connectée comme lues (appelé à l'ouverture du centre de notifications).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { requireAuth } from "@/lib/require-auth";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  await prisma.notification.updateMany({
    where: { user_id: auth.sub, is_read: false },
    data: { is_read: true, read_at: new Date() },
  });

  return NextResponse.json({ success: true });
}
