/**
 * /api/notifications/device-token — Enregistrement des tokens FCM (push web).
 *
 * POST   : appelé par usePushNotifications() après obtention d'un token FCM. Upsert sur
 *          `token` (unique) — le même appareil peut se reconnecter sous le même token, ou
 *          FCM peut le réémettre pour le même utilisateur ; jamais de doublon.
 * DELETE : appelé au logout (voir profile/page.tsx handleLogout) pour arrêter les push vers
 *          cet appareil dès que la session se termine, sans attendre que FCM le signale
 *          comme mort de son côté.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";

const RegisterSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["web", "android", "ios"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  await prisma.deviceToken.upsert({
    where: { token: parsed.data.token },
    create: { user_id: auth.sub, token: parsed.data.token, platform: parsed.data.platform },
    update: { user_id: auth.sub, platform: parsed.data.platform },
  });

  return NextResponse.json({ ok: true });
}

const UnregisterSchema = z.object({ token: z.string().min(1) });

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = UnregisterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  await prisma.deviceToken.deleteMany({ where: { user_id: auth.sub, token: parsed.data.token } });

  return NextResponse.json({ ok: true });
}
