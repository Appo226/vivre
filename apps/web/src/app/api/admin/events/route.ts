/**
 * GET /api/admin/events — File des événements par statut (admin uniquement).
 * ?status=pending_approval|approved|rejected|draft|cancelled (défaut : pending_approval)
 *
 * Distinct de GET /api/events (public, toujours "approved" uniquement) — celui-ci existe
 * spécifiquement pour que l'admin voie les événements payants en attente de revue avant
 * qu'ils ne soient visibles des acheteurs.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const status = request.nextUrl.searchParams.get("status") ?? "pending_approval";

  const events = await prisma.event.findMany({
    where: { status, deleted_at: null },
    select: {
      id: true,
      title: true,
      description: true,
      cover_url: true,
      gallery_urls: true,
      venue_name: true,
      starts_at: true,
      ends_at: true,
      max_capacity: true,
      safety_description: true,
      expected_profile: true,
      created_at: true,
      city: { select: { name: true } },
      category: { select: { name: true } },
      organizer: { select: { id: true, first_name: true, last_name: true, phone: true } },
      ticket_types: { select: { name: true, price_fcfa: true, quantity: true } },
    },
    orderBy: { created_at: "asc" },
  });

  type AdminEvent = (typeof events)[number];
  return NextResponse.json({
    events: events.map((e: AdminEvent) => ({
      ...e,
      starts_at: e.starts_at.toISOString(),
      ends_at: e.ends_at.toISOString(),
      created_at: e.created_at.toISOString(),
    })),
  });
}
