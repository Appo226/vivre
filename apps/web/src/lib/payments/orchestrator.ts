/**
 * lib/payments/orchestrator.ts — Point d'entrée unique pour tout ce qui touche à l'argent.
 *
 * Aucune route ne doit appeler un adapter directement — tout passe par initiatePayment(),
 * verifyAndApplyPaymentAttempt(), confirmManualPayment() ou reconcileStalePayments().
 *
 * RÈGLE D'OR (voir Stage 1 plan, correction 1) : PaymentAttempt.status ne change JAMAIS sur la
 * seule base du temps écoulé. Seul un résultat AUTHENTIQUE du provider (adapter.verify()) ou
 * une transition interne valide (adapter.initiate() qui réussit/échoue) peut faire bouger un
 * statut. Un appel verify() qui lève une exception (timeout/réseau/panne) est catché ici et NE
 * change jamais le statut — voir verifyAndApplyPaymentAttempt.
 */

import { Prisma } from "@prisma/client";
import type { PaymentAttemptStatus, PaymentProviderKind } from "@prisma/client";
import { prisma } from "@vivre/database";
import { getAdapter, isProviderAvailable } from "@/lib/payments/registry";
import { AdapterCapabilityError } from "@/lib/payments/types";
import { issueTicketsForBooking, notifyEventPendingApproval } from "@/lib/events";
import { notify } from "@/lib/notifications";

export type PaymentBookingType = "event" | "event_listing" | "ad_campaign";

const PAYMENT_ACTIVE_RECHECK_MINUTES = 30; // start actively re-verifying an open cinetpay attempt
const PAYMENT_REVIEW_AFTER_HOURS = 24;     // flag for a human, once — never auto-terminalize

/**
 * Pose le FK payment_id sur l'entité appelante DANS LA MÊME TRANSACTION que la création du
 * Payment — évite la fenêtre où une commande pourrait passer "confirmed" (via
 * applyCompletedPayment, après commit) avant que son payment_id ne soit lui-même posé.
 * "event_listing" n'a pas de FK payment_id sur Event (jamais eu — la logique de réutilisation
 * s'appuie sur booking_type+booking_id, voir events/[id]/submit).
 */
async function linkPaymentToBooking(
  tx: Prisma.TransactionClient,
  bookingType: PaymentBookingType,
  bookingId: string,
  paymentId: string
): Promise<void> {
  if (bookingType === "event") {
    await tx.eventBooking.update({ where: { id: bookingId }, data: { payment_id: paymentId } });
  } else if (bookingType === "ad_campaign") {
    await tx.adCampaign.update({ where: { id: bookingId }, data: { payment_id: paymentId } });
  }
}

/* ============================================================
 * INITIATE
 * ============================================================ */

export interface InitiatePaymentInput {
  userId: string;
  bookingType: PaymentBookingType;
  bookingId: string;
  amountFcfa: number;
  platformFeeFcfa: number;
  supplierAmountFcfa: number;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  provider: PaymentProviderKind;
  /** Si fourni, réutilise ce Payment (remis à "pending") plutôt que d'en créer un nouveau —
   *  correspond à booking.payment_id côté appelant. Une NOUVELLE PaymentAttempt est TOUJOURS
   *  créée, que Payment soit neuf ou réutilisé — c'est ce qui corrige le bug où
   *  /api/payments/initiate réécrivait la même ligne Payment à chaque retry. */
  existingPaymentId?: string | null;
  clientIdempotencyKey?: string;
  /** Fonction, pas une chaîne pré-construite : CinetPay's return URL encode l'id du Payment
   *  (voir lib/cinetpay.ts buildReturnUrl), qui n'existe qu'UNE FOIS que ce Payment a été
   *  créé/réutilisé ci-dessous — impossible de le connaître avant d'appeler cette fonction. */
  returnUrl: (paymentId: string) => string;
  notifyUrl: string;
}

export interface InitiatePaymentOutcome {
  payment: { id: string };
  attempt: { id: string; status: PaymentAttemptStatus };
  redirectUrl?: string;
  /** Référence informative du provider (ex: CinetPay payment_token, pour le mode widget
   *  "seamless" utilisé par events/[id]/submit) — jamais utilisée pour la vérification. */
  providerRef?: string;
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutcome> {
  if (!isProviderAvailable(input.provider)) {
    throw new Error(`Provider "${input.provider}" indisponible — vérifier isProviderAvailable() avant d'appeler`);
  }
  const adapter = getAdapter(input.provider);
  if (!adapter.capabilities.canInitiate || !adapter.initiate) {
    throw new AdapterCapabilityError(input.provider, "initiate");
  }

  // 1) Payment (créé ou réutilisé) + PaymentAttempt neuve, en transaction courte — aucun appel
  //    réseau ici, uniquement des écritures DB.
  const { payment, attempt } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = input.existingPaymentId
      ? await tx.payment.update({
          where: { id: input.existingPaymentId },
          data: { status: "pending" },
          select: { id: true },
        })
      : await tx.payment.create({
          data: {
            user_id: input.userId,
            amount: input.amountFcfa,
            payment_method: "pending",
            status: "pending",
            booking_type: input.bookingType,
            booking_id: input.bookingId,
            platform_fee: input.platformFeeFcfa,
            supplier_amount: input.supplierAmountFcfa,
          },
          select: { id: true },
        });

    if (!input.existingPaymentId) {
      await linkPaymentToBooking(tx, input.bookingType, input.bookingId, payment.id);
    }

    const attempt = await tx.paymentAttempt.create({
      data: {
        payment_id: payment.id,
        provider: input.provider,
        status: "initiated",
        amount_fcfa: input.amountFcfa,
        ...(input.clientIdempotencyKey && { client_idempotency_key: input.clientIdempotencyKey }),
      },
      select: { id: true, status: true },
    });

    return { payment, attempt };
  });

  // 2) Appel réseau au provider — JAMAIS à l'intérieur d'une transaction DB.
  try {
    const result = await adapter.initiate({
      paymentAttemptId: attempt.id,
      amountFcfa: input.amountFcfa,
      description: input.description,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      ...(input.customerEmail && { customerEmail: input.customerEmail }),
      returnUrl: input.returnUrl(payment.id),
      notifyUrl: input.notifyUrl,
    });

    const updated = await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "pending",
        ...(result.providerRef && { provider_ref: result.providerRef }),
        ...(result.raw !== undefined && { raw_provider_response: result.raw as Prisma.InputJsonValue }),
      },
      select: { id: true, status: true },
    });

    return {
      payment,
      attempt: updated,
      ...(result.redirectUrl && { redirectUrl: result.redirectUrl }),
      ...(result.providerRef && { providerRef: result.providerRef }),
    };
  } catch (err) {
    // Transition interne valide : l'initiation elle-même a échoué au niveau du provider —
    // authentique, pas une devinette temporelle. Le Payment reste "pending" (rien n'a jamais
    // vraiment démarré côté provider) ; c'est CETTE tentative précise qui échoue.
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "failed",
        resolved_at: new Date(),
        failure_message: err instanceof Error ? err.message : "Erreur inconnue à l'initiation",
      },
    });
    throw err; // laisse l'appelant (route) gérer la réponse HTTP d'erreur, comme aujourd'hui
  }
}

/* ============================================================
 * VERIFY & APPLY (webhook + réconciliation)
 * ============================================================ */

export interface VerifyAndApplyResult {
  applied: boolean;
  status: PaymentAttemptStatus;
  verificationError?: boolean;
}

export async function verifyAndApplyPaymentAttempt(paymentAttemptId: string): Promise<VerifyAndApplyResult> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: paymentAttemptId },
    select: { id: true, status: true, provider: true, payment_id: true },
  });
  if (!attempt) {
    throw new Error(`PaymentAttempt introuvable: ${paymentAttemptId}`);
  }

  // Idempotent : un attempt déjà terminal ne bouge plus jamais.
  const TERMINAL: PaymentAttemptStatus[] = ["completed", "failed", "expired", "cancelled"];
  if (TERMINAL.includes(attempt.status)) {
    return { applied: false, status: attempt.status };
  }

  const adapter = getAdapter(attempt.provider);
  if (!adapter.capabilities.canVerify || !adapter.verify) {
    throw new AdapterCapabilityError(attempt.provider, "verify");
  }

  let verification;
  try {
    verification = await adapter.verify(attempt.id);
  } catch (err) {
    // CORRECTION 1 — le cœur de la règle : un verify() qui échoue (timeout/réseau/panne)
    // n'est PAS une réponse authentique. On ne touche à AUCUN statut ici. La tentative sera
    // retentée au prochain passage de réconciliation.
    console.error(`[payments] Échec verify() pour attempt ${attempt.id} (provider ${attempt.provider}):`, err);
    return { applied: false, status: attempt.status, verificationError: true };
  }

  if (verification.status === "pending") {
    // Réponse authentique du provider : "toujours en attente". Pas une transition — on
    // confirme juste l'état actuel, on ne réécrit rien.
    return { applied: false, status: attempt.status };
  }

  if (verification.status === "failed") {
    // Écriture conditionnelle — seule la requête qui gagne la course applique l'effet métier.
    const { count } = await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ["initiated", "pending"] } },
      data: {
        status: "failed",
        resolved_at: new Date(),
        ...(verification.raw !== undefined && { raw_provider_response: verification.raw as Prisma.InputJsonValue }),
      },
    });
    if (count === 0) {
      // Une autre requête concurrente a déjà résolu cette tentative entre notre lecture et
      // notre écriture — relire l'état final plutôt que de prétendre avoir agi.
      const current = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { status: true } });
      return { applied: false, status: current.status };
    }

    // Ne jamais dégrader un Payment déjà marqué "completed" (par une AUTRE tentative) — une
    // tentative tardive qui échoue après qu'une autre a déjà réussi ne doit rien écraser.
    await prisma.payment.updateMany({
      where: { id: attempt.payment_id, status: { not: "completed" } },
      data: { status: "failed", failed_at: new Date(), failure_reason: "Refusé par le provider" },
    });

    return { applied: true, status: "failed" };
  }

  // verification.status === "completed"
  const { count } = await prisma.paymentAttempt.updateMany({
    where: { id: attempt.id, status: { in: ["initiated", "pending"] } },
    data: {
      status: "completed",
      resolved_at: new Date(),
      ...(verification.raw !== undefined && { raw_provider_response: verification.raw as Prisma.InputJsonValue }),
    },
  });
  if (count === 0) {
    const current = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { status: true } });
    return { applied: false, status: current.status };
  }

  // GARDE DOUBLE-COMPLÉTION : une AUTRE tentative sur ce même Payment est-elle déjà
  // "completed" ? Si oui, de l'argent réel a peut-être bougé deux fois — on ne rejoue JAMAIS
  // l'effet métier (déjà idempotent de toute façon), mais on signale pour revue humaine au
  // lieu d'accepter silencieusement.
  const priorCompletedSiblings = await prisma.paymentAttempt.count({
    where: { payment_id: attempt.payment_id, status: "completed", id: { not: attempt.id } },
  });
  if (priorCompletedSiblings > 0) {
    await flagPaymentAttemptForReview(attempt.id, "double_completion");
    return { applied: false, status: "completed" };
  }

  const payment = await prisma.payment.update({
    where: { id: attempt.payment_id },
    data: {
      status: "completed",
      payment_method: verification.paymentMethod ?? "unknown",
      paid_at: new Date(),
    },
    select: { booking_type: true, booking_id: true },
  });

  await applyCompletedPayment({ bookingType: payment.booking_type as PaymentBookingType, bookingId: payment.booking_id });

  return { applied: true, status: "completed" };
}

/* ============================================================
 * MANUAL CONFIRMATION (pont mobile money)
 * ============================================================ */

export interface ConfirmManualPaymentInput {
  userId: string;
  bookingType: PaymentBookingType;
  bookingId: string;
  existingPaymentId?: string | null;
  amountFcfa: number;
  platformFeeFcfa: number;
  supplierAmountFcfa: number;
  referenceNote: string;
  confirmedByUserId: string;
}

export async function confirmManualPayment(
  input: ConfirmManualPaymentInput
): Promise<{ payment: { id: string }; attempt: { id: string } }> {
  const adapter = getAdapter("manual_bridge");
  if (!adapter.capabilities.requiresManualConfirmation || !adapter.confirmManually) {
    throw new AdapterCapabilityError("manual_bridge", "confirmManually");
  }

  const result = await adapter.confirmManually({
    referenceNote: input.referenceNote,
    confirmedByUserId: input.confirmedByUserId,
  });

  const { payment, attempt } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = input.existingPaymentId
      ? await tx.payment.update({
          where: { id: input.existingPaymentId },
          data: {
            status: "completed",
            payment_method: result.paymentMethod ?? "manual_mobile_money",
            provider_ref: input.referenceNote,
            paid_at: new Date(),
          },
          select: { id: true },
        })
      : await tx.payment.create({
          data: {
            user_id: input.userId,
            amount: input.amountFcfa,
            payment_method: result.paymentMethod ?? "manual_mobile_money",
            provider_ref: input.referenceNote,
            status: "completed",
            paid_at: new Date(),
            booking_type: input.bookingType,
            booking_id: input.bookingId,
            platform_fee: input.platformFeeFcfa,
            supplier_amount: input.supplierAmountFcfa,
          },
          select: { id: true },
        });

    if (!input.existingPaymentId) {
      await linkPaymentToBooking(tx, input.bookingType, input.bookingId, payment.id);
    }

    // Née déjà résolue — un pont manuel n'a pas de phase "initiated"/"pending" (voir
    // ManualBridgeAdapter). Ne passe donc jamais par la réconciliation.
    const attempt = await tx.paymentAttempt.create({
      data: {
        payment_id: payment.id,
        provider: "manual_bridge",
        status: "completed",
        amount_fcfa: input.amountFcfa,
        provider_ref: input.referenceNote,
        initiated_at: new Date(),
        resolved_at: new Date(),
      },
      select: { id: true },
    });

    return { payment, attempt };
  });

  await applyCompletedPayment({
    bookingType: input.bookingType,
    bookingId: input.bookingId,
    confirmedByUserId: input.confirmedByUserId,
  });

  return { payment, attempt };
}

/* ============================================================
 * BUSINESS EFFECT DISPATCH (partagé verify + manual)
 * ============================================================ */

async function applyCompletedPayment(params: {
  bookingType: PaymentBookingType;
  bookingId: string;
  confirmedByUserId?: string;
}): Promise<void> {
  if (params.bookingType === "event") {
    await prisma.eventBooking.update({ where: { id: params.bookingId }, data: { status: "confirmed" } });
    // issueTicketsForBooking gère son propre verrouillage/transaction — appelé après commit,
    // jamais imbriqué dans la transaction ci-dessus (même règle que l'ancien webhook).
    await issueTicketsForBooking(params.bookingId);
  } else if (params.bookingType === "event_listing") {
    const event = await prisma.event.update({
      where: { id: params.bookingId },
      data: { status: "pending_approval", has_paid_publishing: true },
      select: { id: true, title: true, organizer: { select: { id: true, phone: true, email: true } } },
    });
    void notifyEventPendingApproval(event);
  } else {
    // "ad_campaign" — 100% revenu VIVRE, pas de billets/organisateur à notifier ici, juste le
    // statut de diffusion. Voir events/[id]/approve pour la logique équivalente côté ticket.
    await prisma.adCampaign.update({
      where: { id: params.bookingId },
      data: { status: "paid", paid_at: new Date(), ...(params.confirmedByUserId && { confirmed_by: params.confirmedByUserId }) },
    });
  }
}

async function flagPaymentAttemptForReview(
  attemptId: string,
  reason: "stale" | "double_completion"
): Promise<void> {
  // Idempotent — ne (re)signale et ne renotifie jamais un attempt déjà flaggé.
  const { count } = await prisma.paymentAttempt.updateMany({
    where: { id: attemptId, flagged_for_review_at: null },
    data: { flagged_for_review_at: new Date() },
  });
  if (count === 0) return;

  const admins = await prisma.userRole.findMany({ where: { role: "admin" }, select: { user_id: true } });
  const reasonLabel = reason === "stale" ? "reste non résolu depuis plus de 24h" : "a reçu une double confirmation";
  for (const admin of admins) {
    void notify({
      userId: admin.user_id,
      type: "payment_needs_review",
      title: "Paiement à vérifier",
      body: `Une tentative de paiement (${attemptId.slice(0, 8)}) ${reasonLabel} — vérification manuelle requise.`,
      data: { payment_attempt_id: attemptId },
    });
  }
}

/* ============================================================
 * RECONCILIATION
 * ============================================================ */

export interface ReconcileResult {
  checked: number;
  resolvedCompleted: number;
  resolvedFailed: number;
  stillPending: number;
  verificationErrors: number;
  flaggedForReview: number;
  doubleCompletionFlags: number;
  ticketsRepaired: number;
}

export async function reconcileStalePayments(options?: { limit?: number }): Promise<ReconcileResult> {
  const limit = options?.limit ?? 200;
  const result: ReconcileResult = {
    checked: 0,
    resolvedCompleted: 0,
    resolvedFailed: 0,
    stillPending: 0,
    verificationErrors: 0,
    flaggedForReview: 0,
    doubleCompletionFlags: 0,
    ticketsRepaired: 0,
  };

  // Pass 1 — active re-verification. Seuls les attempts "cinetpay" sont ici : manual_bridge
  // naît toujours déjà "completed" (voir confirmManualPayment) et n'a donc jamais besoin de
  // vérification active.
  const recheckCutoff = new Date(Date.now() - PAYMENT_ACTIVE_RECHECK_MINUTES * 60 * 1000);
  const activeAttempts = await prisma.paymentAttempt.findMany({
    where: { provider: "cinetpay", status: { in: ["initiated", "pending"] }, initiated_at: { lt: recheckCutoff } },
    select: { id: true },
    take: limit,
  });

  for (const a of activeAttempts) {
    result.checked += 1;
    const outcome = await verifyAndApplyPaymentAttempt(a.id);
    if (outcome.verificationError) result.verificationErrors += 1;
    else if (outcome.status === "completed" && outcome.applied) result.resolvedCompleted += 1;
    else if (outcome.status === "completed" && !outcome.applied) result.doubleCompletionFlags += 1;
    else if (outcome.status === "failed") result.resolvedFailed += 1;
    else result.stillPending += 1;
  }

  // Pass 2 — stale-review flagging. Indépendant de la pass 1 : un attempt peut être resté
  // "pending" ci-dessus ET franchir en plus le seuil de revue admin dans le même passage.
  const reviewCutoff = new Date(Date.now() - PAYMENT_REVIEW_AFTER_HOURS * 60 * 60 * 1000);
  const staleAttempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: "cinetpay",
      status: { in: ["initiated", "pending"] },
      initiated_at: { lt: reviewCutoff },
      flagged_for_review_at: null,
    },
    select: { id: true },
    take: limit,
  });
  for (const a of staleAttempts) {
    await flagPaymentAttemptForReview(a.id, "stale");
    result.flaggedForReview += 1;
  }

  // Auto-réparation — cas du pont manuel : Payment complété + commande confirmée, mais
  // issueTicketsForBooking n'a jamais abouti (crash entre les deux écritures non-atomiques de
  // confirm-payment avant Stage 1, ou une panne survenue depuis). issueTicketsForBooking est
  // déjà idempotent (voir lib/events.ts) — le rappeler ici est sûr même si ça a déjà réussi.
  const brokenBookings = await prisma.eventBooking.findMany({
    where: { status: "confirmed", payment: { status: "completed" }, tickets: { none: {} } },
    select: { id: true },
    take: limit,
  });
  for (const b of brokenBookings) {
    await issueTicketsForBooking(b.id);
    result.ticketsRepaired += 1;
  }

  return result;
}
