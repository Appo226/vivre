/**
 * POST /api/events/bookings — Réserver des billets.
 *
 * Billet gratuit (total_amount = 0 après réduction) : confirmé immédiatement, QR code émis
 * tout de suite — pas de paiement à finaliser.
 * Billet payant : reste "pending" jusqu'à ce que /api/payments/initiate confirme le paiement
 * mobile money (Orange/Moov/Telecel/Wave via CinetPay) et que le webhook le passe à "confirmed".
 *
 * Modèle de frais : l'acheteur paie le prix affiché (buyer_fee = 0 par défaut, configurable
 * par l'admin) — aucune surcharge surprise au moment de payer.
 *
 * CONCURRENCE : la vérification de disponibilité et la création de la réservation se font
 * dans UNE SEULE transaction, avec un verrou (SELECT ... FOR UPDATE) posé sur la ligne du
 * type de billet AVANT de recompter les ventes. Sans ce verrou, deux achats simultanés pour
 * le dernier billet pourraient tous les deux passer la vérification de dispo — la classique
 * survente. Le verrou force les transactions concurrentes à s'exécuter l'une après l'autre
 * pour un même type de billet ; la seconde voit alors le total à jour et est refusée si
 * besoin. Le même principe protège le code promo contre une sur-utilisation concurrente.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@vivre/database";
import { apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/require-auth";
import { issueTicketsForBooking, ACTIVE_BOOKING_STATUSES } from "@/lib/events";
import { CreateBookingSchema } from "@/lib/schemas/events";
import { validatePromoCodeForUpdate } from "@/lib/promo-codes";
import { getPlatformSettings, effectiveBuyerFee } from "@/lib/platform-settings";

class BookingRejected extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Le numéro doit être confirmé par OTP avant qu'une réservation (même gratuite) puisse
  // être créée — sinon rien n'empêche quelqu'un de réserver avec le numéro de quelqu'un
  // d'autre, ce qui devient un vrai litige côté billetterie/paiement le jour de l'événement.
  const buyer = await prisma.user.findUnique({ where: { id: auth.sub }, select: { is_verified: true } });
  if (!buyer?.is_verified) {
    return apiError(
      403,
      "PHONE_NOT_VERIFIED",
      "Vérifiez votre numéro de téléphone avant de réserver un billet.",
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "Données invalides", parsed.error.errors[0]?.message);
  }
  const { event_id, ticket_type_id, quantity, promo_code, selected_variant, merch_items } = parsed.data;

  const merchIds = merch_items.map((m) => m.merch_item_id);
  if (new Set(merchIds).size !== merchIds.length) {
    return apiError(422, "DUPLICATE_MERCH_ITEM", "Chaque produit ne peut apparaître qu'une fois dans la commande");
  }

  const event = await prisma.event.findUnique({
    where: { id: event_id },
    select: { id: true, status: true, starts_at: true, commission_percent: true },
  });
  if (!event) {
    return apiError(404, "EVENT_NOT_FOUND", "Événement introuvable");
  }
  if (event.status !== "approved") {
    return apiError(409, "EVENT_NOT_AVAILABLE", "Cet événement n'est pas encore disponible à la réservation");
  }
  if (new Date(event.starts_at) < new Date()) {
    return apiError(409, "EVENT_PAST", "Cet événement est passé");
  }

  const ticketType = await prisma.eventTicketType.findUnique({
    where: { id: ticket_type_id },
    select: {
      id: true,
      event_id: true,
      name: true,
      price_fcfa: true,
      quantity: true,
      max_per_order: true,
      variant_options: true,
      sale_starts_at: true,
      sale_ends_at: true,
      is_active: true,
    },
  });
  if (!ticketType || ticketType.event_id !== event_id || !ticketType.is_active) {
    return apiError(404, "TICKET_TYPE_NOT_FOUND", "Type de billet introuvable ou inactif");
  }
  if (quantity > ticketType.max_per_order) {
    return apiError(409, "EXCEEDS_MAX_PER_ORDER", `Maximum ${ticketType.max_per_order} billets par commande`);
  }
  // Si le billet a des variantes (ex: taille de t-shirt), l'acheteur doit en choisir une —
  // et elle doit être une des valeurs proposées par l'organisateur, pas n'importe quoi.
  if (ticketType.variant_options.length > 0) {
    if (!selected_variant) {
      return apiError(422, "VARIANT_REQUIRED", "Choisissez une option (ex: taille) avant de réserver");
    }
    if (!ticketType.variant_options.includes(selected_variant)) {
      return apiError(422, "VARIANT_INVALID", "Option invalide pour ce type de billet");
    }
  }

  const now = new Date();
  if (ticketType.sale_starts_at && now < ticketType.sale_starts_at) {
    return apiError(409, "SALE_NOT_STARTED", "La vente de ce billet n'a pas encore commencé");
  }
  if (ticketType.sale_ends_at && now > ticketType.sale_ends_at) {
    return apiError(409, "SALE_ENDED", "La vente de ce billet est terminée");
  }

  // Merch optionnel — chaque item doit appartenir au même événement, être actif, et avoir
  // une variante valide choisie si l'organisateur en a défini. Triés par id pour verrouiller
  // dans un ordre déterministe plus bas (évite les deadlocks entre commandes concurrentes
  // qui se chevauchent sur les mêmes produits).
  const merchLookup = merchIds.length > 0
    ? await prisma.eventMerchItem.findMany({ where: { id: { in: merchIds } }, orderBy: { id: "asc" } })
    : [];
  const merchById = new Map(merchLookup.map((m) => [m.id, m]));
  for (const requested of merch_items) {
    const item = merchById.get(requested.merch_item_id);
    if (!item || item.event_id !== event_id || !item.is_active) {
      return apiError(404, "MERCH_ITEM_NOT_FOUND", "Produit introuvable ou inactif");
    }
    if (item.variant_options.length > 0) {
      if (!requested.variant) {
        return apiError(422, "MERCH_VARIANT_REQUIRED", `Choisissez une option pour "${item.name}"`);
      }
      if (!item.variant_options.includes(requested.variant)) {
        return apiError(422, "MERCH_VARIANT_INVALID", `Option invalide pour "${item.name}"`);
      }
    }
  }

  const settings = await getPlatformSettings();

  try {
    const booking = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verrou posé AVANT de recompter les ventes — voir le commentaire d'en-tête. Le type de
      // billet d'abord, puis les produits merch triés par id : ordre déterministe et constant
      // sur toutes les requêtes concurrentes, pour ne jamais créer de deadlock.
      await tx.$executeRaw`SELECT id FROM event_ticket_types WHERE id = ${ticket_type_id} FOR UPDATE`;
      for (const item of merchLookup) {
        await tx.$executeRaw`SELECT id FROM event_merch_items WHERE id = ${item.id} FOR UPDATE`;
      }

      const sold = await tx.eventBooking.aggregate({
        where: { ticket_type_id, status: { in: ACTIVE_BOOKING_STATUSES } },
        _sum: { quantity: true },
      });
      const available = ticketType.quantity - (sold._sum.quantity ?? 0);
      if (available < quantity) {
        throw new BookingRejected(
          409,
          "INSUFFICIENT_TICKETS",
          `Il ne reste que ${available} billet(s) disponible(s)`,
          { available, requested: quantity }
        );
      }

      for (const requested of merch_items) {
        const item = merchById.get(requested.merch_item_id)!;
        const merchSold = await tx.eventBookingMerchItem.aggregate({
          where: { merch_item_id: item.id, booking: { status: { in: ACTIVE_BOOKING_STATUSES } } },
          _sum: { quantity: true },
        });
        const merchAvailable = item.quantity - (merchSold._sum.quantity ?? 0);
        if (merchAvailable < requested.quantity) {
          throw new BookingRejected(
            409,
            "INSUFFICIENT_MERCH_STOCK",
            `Il ne reste que ${merchAvailable} "${item.name}" disponible(s)`,
            { merch_item_id: item.id, available: merchAvailable, requested: requested.quantity }
          );
        }
      }

      const ticketSubtotalFcfa = ticketType.price_fcfa * quantity;
      const merchSubtotalFcfa = merch_items.reduce((sum, requested) => {
        const item = merchById.get(requested.merch_item_id)!;
        return sum + item.price_fcfa * requested.quantity;
      }, 0);

      let discountFcfa = 0;
      let promoCodeId: string | null = null;
      if (promo_code) {
        // Le code promo ne réduit que le billet — le merch est un extra optionnel, pas
        // remisé, pour ne pas complexifier une règle qui n'a jamais été demandée.
        const promoResult = await validatePromoCodeForUpdate(tx, promo_code, event_id, auth.sub, ticketSubtotalFcfa);
        if (!promoResult.valid) {
          throw new BookingRejected(422, "PROMO_CODE_INVALID", promoResult.error ?? "Code promo invalide");
        }
        discountFcfa = promoResult.discountFcfa ?? 0;
        promoCodeId = promoResult.promoCodeId ?? null;
      }

      const afterDiscount = (ticketSubtotalFcfa - discountFcfa) + merchSubtotalFcfa;
      const buyerFeeFcfa = effectiveBuyerFee(settings, afterDiscount);
      const totalAmount = afterDiscount + buyerFeeFcfa;
      const commissionFcfa = Math.round(afterDiscount * (event.commission_percent / 100));
      const isFree = totalAmount === 0;

      const created = await tx.eventBooking.create({
        data: {
          user_id: auth.sub,
          event_id,
          ticket_type_id,
          quantity,
          selected_variant: selected_variant ?? null,
          unit_price_fcfa: ticketType.price_fcfa,
          subtotal_fcfa: ticketSubtotalFcfa,
          discount_fcfa: discountFcfa,
          buyer_fee_fcfa: buyerFeeFcfa,
          total_amount: totalAmount,
          commission_fcfa: commissionFcfa,
          promo_code_id: promoCodeId,
          status: isFree ? "confirmed" : "pending",
          qr_code: "pending",
        },
      });

      for (const requested of merch_items) {
        const item = merchById.get(requested.merch_item_id)!;
        await tx.eventBookingMerchItem.create({
          data: {
            booking_id: created.id,
            merch_item_id: item.id,
            quantity: requested.quantity,
            variant: requested.variant ?? null,
            price_fcfa_at_purchase: item.price_fcfa,
          },
        });
      }

      if (promoCodeId) {
        await tx.promoCode.update({ where: { id: promoCodeId }, data: { uses_count: { increment: 1 } } });
      }
      return { ...created, merch_subtotal_fcfa: merchSubtotalFcfa };
    });

    const isFree = booking.total_amount === 0;
    if (isFree) {
      await issueTicketsForBooking(booking.id);
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        event_id,
        ticket_type: ticketType.name,
        quantity,
        subtotal_fcfa: booking.subtotal_fcfa,
        merch_subtotal_fcfa: booking.merch_subtotal_fcfa,
        discount_fcfa: booking.discount_fcfa,
        buyer_fee_fcfa: booking.buyer_fee_fcfa,
        total_amount: booking.total_amount,
        status: booking.status,
        message: isFree
          ? "Billet confirmé ! Retrouvez votre QR code dans « Mes billets »."
          : "Réservation créée. Finalisez le paiement pour confirmer votre billet.",
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BookingRejected) {
      return apiError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
