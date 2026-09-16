/**
 * tests/integration/helpers/db.ts — Client Prisma partagé + nettoyage ciblé.
 *
 * Nettoyage par ids suivis, PAS un TRUNCATE global — préserve la ligne singleton
 * PlatformSettings et toute autre donnée de base pouvant exister dans le schéma de test.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export interface TrackedIds {
  userIds: string[];
  eventIds: string[];
  cityIds: string[];
  categoryIds: string[];
}

export function newTrackedIds(): TrackedIds {
  return { userIds: [], eventIds: [], cityIds: [], categoryIds: [] };
}

/** Supprime dans l'ordre respectant les FK — événements (cascade logique jusqu'aux
 *  tickets/paiements) avant utilisateurs avant villes/catégories. */
export async function cleanupTrackedIds(ids: TrackedIds): Promise<void> {
  if (ids.eventIds.length > 0) {
    const bookings = await prisma.eventBooking.findMany({
      where: { event_id: { in: ids.eventIds } },
      select: { id: true, payment_id: true },
    });
    const bookingIds = bookings.map((b) => b.id);
    const paymentIds = bookings.map((b) => b.payment_id).filter((id): id is string => id !== null);

    if (bookingIds.length > 0) {
      await prisma.eventTicket.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await prisma.eventBookingMerchItem.deleteMany({ where: { booking_id: { in: bookingIds } } });
    }
    if (paymentIds.length > 0) {
      await prisma.refund.deleteMany({ where: { payment_id: { in: paymentIds } } });
      await prisma.paymentAttempt.deleteMany({ where: { payment_id: { in: paymentIds } } });
    }
    await prisma.eventBooking.deleteMany({ where: { event_id: { in: ids.eventIds } } });
    if (paymentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prisma.eventTicketType.deleteMany({ where: { event_id: { in: ids.eventIds } } });
    await prisma.eventPayout.deleteMany({ where: { event_id: { in: ids.eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: ids.eventIds } } });
  }

  if (ids.userIds.length > 0) {
    // Filet de sécurité : des Payment peuvent exister pour un user SANS passer par un
    // EventBooking (booking_type "event_listing"/"ad_campaign" créés directement dans un
    // test) — la branche ci-dessus ne les capture pas via bookingIds. On les retrouve donc
    // directement par user_id avant de supprimer les users, quel que soit leur booking_type.
    const orphanPayments = await prisma.payment.findMany({
      where: { user_id: { in: ids.userIds } },
      select: { id: true },
    });
    const orphanPaymentIds = orphanPayments.map((p) => p.id);
    if (orphanPaymentIds.length > 0) {
      await prisma.refund.deleteMany({ where: { payment_id: { in: orphanPaymentIds } } });
      await prisma.paymentAttempt.deleteMany({ where: { payment_id: { in: orphanPaymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: orphanPaymentIds } } });
    }

    await prisma.idempotencyKey.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await prisma.userRole.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }

  if (ids.categoryIds.length > 0) {
    await prisma.eventCategory.deleteMany({ where: { id: { in: ids.categoryIds } } });
  }
  if (ids.cityIds.length > 0) {
    await prisma.city.deleteMany({ where: { id: { in: ids.cityIds } } });
  }
}
