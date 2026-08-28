/**
 * DELETE /api/admin/team/[userId] — Révoque le rôle "admin" d'un compte (super_admin uniquement).
 *
 * Ne touche jamais au rôle "super_admin" — cette route ne peut retirer que "admin", et
 * refuse explicitement d'agir sur un compte super_admin (y compris soi-même) pour éviter
 * de se retrouver sans accès admin par erreur de clic. Un retrait de super_admin, comme
 * son octroi, se fait hors-app.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("super_admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé au super-administrateur");
  }

  const target = await prisma.userRole.findMany({
    where: { user_id: params.userId, role: { in: ["admin", "super_admin"] } },
    select: { role: true },
  });
  if (target.some((r: { role: string }) => r.role === "super_admin")) {
    return apiError(400, "CANNOT_REVOKE_SUPER_ADMIN", "Le rôle super-administrateur ne se retire pas depuis l'app");
  }
  if (!target.some((r: { role: string }) => r.role === "admin")) {
    return apiError(404, "NOT_ADMIN", "Ce compte n'a pas le rôle administrateur");
  }

  await prisma.userRole.delete({
    where: { user_id_role: { user_id: params.userId, role: "admin" } },
  });

  return NextResponse.json({ message: "Rôle administrateur retiré" });
}
