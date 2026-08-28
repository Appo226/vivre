/**
 * POST /api/auth/refresh
 *
 * Échange un refresh token valide contre une nouvelle paire access + refresh.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vivre/database";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";

const BodySchema = z.object({ refresh_token: z.string().min(1) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "refresh_token requis");
  }

  let userId: string;
  try {
    ({ sub: userId } = await verifyRefreshToken(parsed.data.refresh_token));
  } catch {
    return apiError(401, "REFRESH_TOKEN_INVALID", "Refresh token invalide ou expiré. Reconnectez-vous.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, is_active: true, roles: { where: { is_approved: true }, select: { role: true } } },
  });

  if (!user || !user.is_active) {
    return apiError(403, "ACCOUNT_SUSPENDED", "Compte introuvable ou désactivé.");
  }

  const roles = user.roles.map((r: (typeof user.roles)[number]) => r.role);
  const accessToken = await signAccessToken({ sub: user.id, phone: user.phone, roles });
  const refreshToken = await signRefreshToken(user.id);
  const expiresIn = process.env["JWT_EXPIRES_IN"] ?? "1h";
  const expiresAt = new Date(Date.now() + parseExpiresInMs(expiresIn)).toISOString();

  return NextResponse.json({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt });
}

function parseExpiresInMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
  return amount * unitMs;
}
