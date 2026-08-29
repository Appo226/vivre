/**
 * PATCH /api/events/[id]/submit — Soumettre un événement.
 *
 * TOUT événement (gratuit ou payant côté billets) paie désormais des frais de mise en ligne
 * à la soumission — plus d'approbation automatique sans paiement pour les événements
 * gratuits (règle précédente, changée à la demande explicite : "even free events pays us").
 * L'organisateur peut en plus ajouter une publicité (photo ou vidéo, X jours) réglée dans le
 * même paiement — elle ne s'active qu'à l'approbation admin de l'événement (voir
 * events/[id]/approve), jamais avant, même si elle est déjà payée.
 *
 * Le montant total (frais de mise en ligne + pub éventuelle) passe par
 * effectiveListingFeeFcfa/effectiveAdPricePerDayFcfa — 0 si free_period_enabled est actif
 * (interrupteur global) ou si ce compte a une remise à 100% (voir User.fee_discount_percent).
 *
 * Deux chemins :
 *   - Total = 0 → passe directement en "pending_approval", pas de paiement à faire.
 *   - Total > 0 → crée un Payment (booking_type="event_listing"), initie CinetPay (mode
 *     seamless — le frontend ouvre le widget avec le payment_token, pas de redirection),
 *     reste en "draft" jusqu'à confirmation par webhook (voir payments/webhook/route.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { getPlatformSettings, effectiveListingFeeFcfa, effectiveAdPricePerDayFcfa } from "@/lib/platform-settings";
import { cinetpayConfigured, initiateCinetPayPayment, buildReturnUrl, buildNotifyUrl } from "@/lib/cinetpay";
import { notify } from "@/lib/notifications";

const SubmitBodySchema = z.object({
  ad_media_url: z.string().url().optional(),
  ad_media_type: z.enum(["image", "video"]).optional(),
  ad_days: z.number().int().min(1).max(60).optional(),
}).refine(
  (v) => (v.ad_media_url === undefined) === (v.ad_media_type === undefined) && (v.ad_media_url === undefined) === (v.ad_days === undefined),
  { message: "ad_media_url, ad_media_type et ad_days doivent être fournis ensemble, ou pas du tout" }
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  const bodyRaw: unknown = await request.json().catch(() => ({}));
  const parsedBody = SubmitBodySchema.safeParse(bodyRaw ?? {});
  if (!parsedBody.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsedBody.error.errors[0]?.message);
  }
  const ad = parsedBody.data.ad_media_url
    ? { url: parsedBody.data.ad_media_url, mediaType: parsedBody.data.ad_media_type!, days: parsedBody.data.ad_days! }
    : null;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      organizer_id: true,
      status: true,
      title: true,
      cover_url: true,
      gallery_urls: true,
      latitude: true,
      longitude: true,
      ticket_types: { select: { price_fcfa: true } },
      organizer: { select: { id: true, phone: true, email: true, first_name: true, last_name: true, fee_discount_percent: true } },
    },
  });

  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.organizer_id !== auth.sub) {
    return apiError(403, "AUTH_FORBIDDEN", "Accès refusé");
  }
  if (!["draft", "rejected"].includes(event.status)) {
    return apiError(409, "INVALID_STATUS_TRANSITION", `Un événement en statut "${event.status}" ne peut pas être soumis`);
  }
  if (event.ticket_types.length === 0) {
    return apiError(409, "NO_TICKET_TYPES", "Ajoutez au moins un type de billet avant de soumettre");
  }

  // Au moins 3 visuels (photos ou affiches) — signal de confiance minimal, exigé de tous
  const photoCount = (event.cover_url ? 1 : 0) + event.gallery_urls.length;
  if (photoCount < 3) {
    return apiError(
      409,
      "NOT_ENOUGH_PHOTOS",
      `Ajoutez au moins 3 photos ou affiches avant de soumettre (${photoCount}/3 actuellement)`
    );
  }
  if (event.latitude === null || event.longitude === null) {
    return apiError(409, "LOCATION_REQUIRED", "Le lieu exact de l'événement doit être positionné sur la carte");
  }

  const isFullyFree = event.ticket_types.every((tt: (typeof event.ticket_types)[number]) => tt.price_fcfa === 0);

  // Événement payant → l'organisateur doit être vérifié (pièce d'identité + appel confirmé)
  // avant toute mise en vente de billets payants. Les événements gratuits restent sans friction
  // SUR CE POINT PRÉCIS — ils paient quand même les frais de mise en ligne ci-dessous.
  if (!isFullyFree) {
    const verification = await prisma.organizerVerification.findUnique({
      where: { user_id: auth.sub },
      select: { status: true },
    });
    if (verification?.status !== "verified") {
      return apiError(
        403,
        "ORGANIZER_NOT_VERIFIED",
        "Votre compte doit être vérifié (pièce d'identité + appel de confirmation) avant de publier un événement payant. Complétez votre vérification dans votre profil organisateur.",
        { verification_status: verification?.status ?? "unverified" }
      );
    }
  }

  const settings = await getPlatformSettings();
  const discount = event.organizer.fee_discount_percent;
  const listingFee = effectiveListingFeeFcfa(settings, discount);
  const adFee = ad ? effectiveAdPricePerDayFcfa(settings, ad.mediaType, discount) * ad.days : 0;
  const totalFcfa = listingFee + adFee;

  // Toujours explicite (jamais omis) : un événement rejeté puis resoumis SANS pub cette
  // fois doit effacer la pub de la tentative précédente, pas la laisser traîner pour une
  // future approbation qui ne devrait plus la concerner.
  const pendingAdData = ad
    ? { pending_ad_media_url: ad.url, pending_ad_media_type: ad.mediaType, pending_ad_days: ad.days, pending_ad_price_fcfa: adFee }
    : { pending_ad_media_url: null, pending_ad_media_type: null, pending_ad_days: null, pending_ad_price_fcfa: null };

  // Resoumission d'un événement REJETÉ : s'il a déjà un paiement complété pour la mise en
  // ligne, non remboursé, qui couvre le nouveau total (même sélection de pub, ou aucune) —
  // pas besoin de payer une seconde fois. Sans ce contrôle, chaque aller-retour rejet →
  // correction → resoumission facturerait à nouveau les frais déjà réglés une première fois.
  // Ne couvre PAS le cas où la nouvelle sélection coûte plus cher (ex : pub ajoutée après
  // coup) — dans ce cas on retombe sur un paiement neuf pour le nouveau total, plus simple
  // que de facturer seulement la différence pour un cas marginal.
  let reusedPriorPayment = false;
  if (event.status === "rejected" && totalFcfa > 0) {
    const priorPayment = await prisma.payment.findFirst({
      where: { booking_type: "event_listing", booking_id: id, status: "completed", amount: { gte: totalFcfa } },
      select: { id: true },
    });
    if (priorPayment) {
      const alreadyRefunded = await prisma.refund.findFirst({
        where: { booking_type: "event_listing", booking_id: id, status: { not: "rejected" } },
      });
      reusedPriorPayment = !alreadyRefunded;
    }
  }

  if (totalFcfa === 0 || reusedPriorPayment) {
    await prisma.event.update({
      where: { id },
      data: {
        status: "pending_approval",
        publishing_fee_fcfa: totalFcfa,
        has_paid_publishing: true,
        ...pendingAdData,
      },
    });

    void notify({
      userId: event.organizer.id,
      type: "event_approved", // réutilisé volontairement — pas de nouveau type pour un simple accusé de réception
      title: "Événement soumis",
      body: `${event.title} est en attente d'approbation. Vous serez notifié dès la décision.`,
      data: { event_id: id },
    });

    return NextResponse.json({
      message: reusedPriorPayment
        ? "Événement resoumis pour approbation — déjà réglé lors de la soumission précédente."
        : "Événement soumis pour approbation — aucun frais à payer.",
      event_id: id,
      status: "pending_approval",
      total_fcfa: 0,
    });
  }

  if (!cinetpayConfigured()) {
    return apiError(
      503,
      "PAYMENTS_NOT_CONFIGURED",
      "Les paiements ne sont pas encore configurés. Réessayez plus tard ou contactez le support."
    );
  }

  const payment = await prisma.payment.create({
    data: {
      user_id: auth.sub,
      amount: totalFcfa,
      payment_method: "pending",
      status: "pending",
      booking_type: "event_listing",
      booking_id: event.id,
      platform_fee: totalFcfa,
      supplier_amount: 0,
    },
    select: { id: true },
  });

  const organizerName = [event.organizer.first_name, event.organizer.last_name].filter(Boolean).join(" ") || "Organisateur VIVRE";

  try {
    const result = await initiateCinetPayPayment({
      transactionId: payment.id,
      amountFcfa: totalFcfa,
      description: `Mise en ligne — ${event.title}`,
      customerName: organizerName,
      customerPhone: event.organizer.phone,
      ...(event.organizer.email && { customerEmail: event.organizer.email }),
      returnUrl: buildReturnUrl(payment.id),
      notifyUrl: buildNotifyUrl(),
    });

    await prisma.payment.update({ where: { id: payment.id }, data: { provider_ref: result.paymentToken } });
    await prisma.event.update({
      where: { id },
      data: { publishing_fee_fcfa: totalFcfa, ...pendingAdData },
    });

    return NextResponse.json({
      payment_id: payment.id,
      payment_token: result.paymentToken,
      total_fcfa: totalFcfa,
      listing_fee_fcfa: listingFee,
      ad_fee_fcfa: adFee,
    });
  } catch (err) {
    return apiError(502, "CINETPAY_ERROR", "Impossible d'initier le paiement", (err as Error).message);
  }
}
