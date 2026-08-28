/**
 * PATCH /api/admin/organizer-verifications/[id]/decision — Approuver ou rejeter une vérification.
 *
 * "verify" exige explicitement que l'admin confirme avoir passé l'appel téléphonique ET
 * que le nom sur la pièce correspond au nom du compte de versement — on ne peut pas
 * approuver "en un clic" sans ces deux confirmations manuelles.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { sendEmail, verificationApprovedEmail, verificationRejectedEmail } from "@/lib/email";

const DecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    phone_call_notes: z.string().min(5).max(1000),
    name_match_confirmed: z.literal(true),
  }),
  z.object({
    action: z.literal("reject"),
    rejection_reason: z.string().min(10).max(1000),
  }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.roles.includes("admin")) {
    return apiError(403, "AUTH_FORBIDDEN", "Réservé aux administrateurs");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }

  const verification = await prisma.organizerVerification.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { email: true } } },
  });
  if (!verification) {
    return apiError(404, "VERIFICATION_NOT_FOUND", "Vérification introuvable");
  }
  if (verification.status !== "pending_review") {
    return apiError(409, "INVALID_STATUS", `Statut actuel "${verification.status}" — rien à décider`);
  }

  const appUrl = process.env["APP_URL"] ?? "https://vivrebf.com";

  if (parsed.data.action === "verify") {
    await prisma.organizerVerification.update({
      where: { id: params.id },
      data: {
        status: "verified",
        verified_by: auth.sub,
        verified_at: new Date(),
        phone_call_confirmed_at: new Date(),
        phone_call_notes: parsed.data.phone_call_notes,
        phone_call_by: auth.sub,
        name_match_confirmed: true,
      },
    });
    void sendEmail({
      to: verification.user.email,
      subject: "Votre compte organisateur est vérifié",
      html: verificationApprovedEmail({ profileUrl: `${appUrl}/evenements/publier` }),
    });
    return NextResponse.json({ message: "Organisateur vérifié", status: "verified" });
  }

  await prisma.organizerVerification.update({
    where: { id: params.id },
    data: { status: "rejected", rejection_reason: parsed.data.rejection_reason },
  });
  void sendEmail({
    to: verification.user.email,
    subject: "Votre vérification organisateur n'a pas été validée",
    html: verificationRejectedEmail({ reason: parsed.data.rejection_reason, profileUrl: `${appUrl}/profile` }),
  });
  return NextResponse.json({ message: "Vérification rejetée", status: "rejected" });
}
