/**
 * lib/idempotency.ts — Protection contre les doubles soumissions (POST /events/bookings,
 * POST /payments/initiate).
 *
 * Sémantique exacte et volontairement bornée (voir Stage 1 plan, correction 3) :
 *   - clé nouvelle                                    → exécuter la requête
 *   - même clé + corps de requête DIFFÉRENT            → 409 IDEMPOTENCY_KEY_REUSED
 *   - même clé + même corps + status="completed"       → rejoue la réponse stockée
 *   - même clé + même corps + status="in_progress"      → UNE attente bornée
 *     (IDEMPOTENCY_RECHECK_DELAY_MS), une relecture, puis soit la réponse rejouée si elle a
 *     fini entre-temps, soit un 409 REQUEST_IN_PROGRESS déterministe. JAMAIS de boucle,
 *     JAMAIS d'attente indéfinie.
 *
 * La concurrence se résout réellement à la base via la contrainte unique [user_id, scope,
 * key] : le create() ci-dessous réussit (cet appelant est le seul exécuteur) ou lève une
 * violation de contrainte, qui est le SEUL signal utilisé pour entrer dans la branche "déjà
 * réclamée" ci-dessous. L'attente bornée n'est qu'une commodité pour le cas quasi-simultané,
 * pas un mécanisme de correction — la correction vient entièrement de la contrainte unique.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";

export type IdempotencyScope = "event_booking_create" | "payment_initiate";

export interface IdempotencyClaim {
  id: string;
  userId: string;
  scope: IdempotencyScope;
  key: string;
}

const IDEMPOTENCY_RECHECK_DELAY_MS = 500; // UNE attente bornée — jamais une boucle
const IDEMPOTENCY_KEY_TTL_HOURS = 24;

function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function claimIdempotencyKey(
  request: NextRequest,
  userId: string,
  scope: IdempotencyScope,
  requestBody: unknown
): Promise<IdempotencyClaim | NextResponse> {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "En-tête Idempotency-Key requis");
  }

  const requestHash = hashRequestBody(requestBody);
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_KEY_TTL_HOURS * 60 * 60 * 1000);

  try {
    await prisma.idempotencyKey.create({
      data: { user_id: userId, scope, key, request_hash: requestHash, status: "in_progress", expires_at: expiresAt },
    });
    return { id: `${userId}:${scope}:${key}`, userId, scope, key };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err; // erreur DB inattendue, pas une violation de contrainte — ne pas masquer
    }

    const existing = await prisma.idempotencyKey.findUnique({
      where: { user_id_scope_key: { user_id: userId, scope, key } },
    });
    if (!existing) {
      // Course extrêmement improbable (créée puis supprimée entre notre insert et cette
      // lecture) — traiter comme si la clé n'existait jamais, laisser le retry naturel du
      // client réessayer proprement.
      return apiError(409, "REQUEST_IN_PROGRESS", "Une requête identique est en cours — réessayez dans quelques secondes.");
    }

    if (existing.request_hash !== requestHash) {
      return apiError(409, "IDEMPOTENCY_KEY_REUSED", "Cette clé d'idempotence a déjà été utilisée avec une requête différente");
    }

    if (existing.status === "completed") {
      return NextResponse.json(existing.response_body, { status: existing.response_status ?? 200 });
    }

    // status === "in_progress" (ou "failed" en cours de nettoyage) — UNE attente bornée, UNE
    // relecture, jamais plus.
    await sleep(IDEMPOTENCY_RECHECK_DELAY_MS);
    const recheck = await prisma.idempotencyKey.findUnique({
      where: { user_id_scope_key: { user_id: userId, scope, key } },
    });
    if (recheck?.status === "completed") {
      return NextResponse.json(recheck.response_body, { status: recheck.response_status ?? 200 });
    }
    return apiError(409, "REQUEST_IN_PROGRESS", "Une requête identique est en cours de traitement — réessayez dans quelques secondes.");
  }
}

export async function resolveIdempotencyKey(
  claim: IdempotencyClaim,
  status: number,
  body: unknown,
  resource?: { type: string; id: string }
): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { user_id_scope_key: { user_id: claim.userId, scope: claim.scope, key: claim.key } },
    data: {
      status: "completed",
      response_status: status,
      response_body: body as Prisma.InputJsonValue,
      ...(resource && { resource_type: resource.type, resource_id: resource.id }),
    },
  });
}

/** Sur une erreur INATTENDUE (pas un rejet métier — voir resolveIdempotencyKey pour ce cas),
 *  supprime la ligne en cours plutôt que de la marquer "failed" et de la laisser bloquer un
 *  retry légitime après une panne transitoire. */
export async function failIdempotencyKey(claim: IdempotencyClaim): Promise<void> {
  await prisma.idempotencyKey
    .delete({ where: { user_id_scope_key: { user_id: claim.userId, scope: claim.scope, key: claim.key } } })
    .catch(() => {});
}
