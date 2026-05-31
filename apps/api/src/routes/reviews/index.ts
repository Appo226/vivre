/**
 * routes/reviews/index.ts — Avis clients VIVRE
 *
 * Permet aux utilisateurs de noter les entités qu'ils ont utilisées :
 *   - Restaurants (commandes livrées)
 *   - Hébergements (réservations terminées)
 *   - Livreurs (commandes reçues)
 *
 * Un avis est "vérifié" (is_verified: true) si l'utilisateur fournit
 * une référence valide d'une commande/réservation terminée qui lui appartient.
 * Cela prévient les faux avis sans bloquer complètement la soumission.
 *
 * Endpoints :
 *   POST /reviews                               — Soumettre un avis
 *   GET  /reviews?entity_type=&entity_id=       — Lister les avis d'une entité
 *   GET  /reviews/eligibility?entity_type=&entity_id= — Vérifier si l'utilisateur peut noter
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";

/* ============================================================
 * HELPER — mise à jour du rating_avg sur l'entité parente
 *
 * Après chaque INSERT/UPDATE d'avis visible, on recalcule la moyenne
 * depuis la table reviews (source of truth) et on met à jour l'entité.
 * ============================================================ */

async function refreshEntityRating(entityType: string, entityId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { entity_type: entityType, entity_id: entityId, is_visible: true },
    _avg: { rating: true },
    _count: { id: true },
  });

  const avg   = agg._avg.rating ?? 0;
  const count = agg._count.id;

  if (entityType === "restaurant") {
    await prisma.restaurant.update({
      where: { id: entityId },
      data:  { rating_avg: Math.round(avg * 10) / 10 },
    });
  } else if (entityType === "property") {
    await prisma.property.update({
      where: { id: entityId },
      data:  { rating_avg: Math.round(avg * 10) / 10 },
    });
  } else if (entityType === "driver") {
    await prisma.driver.update({
      where: { id: entityId },
      data:  { rating_avg: Math.round(avg * 10) / 10 },
    });
  }

  if (entityType === "event") {
    await prisma.event.update({
      where: { id: entityId },
      data:  { rating_avg: Math.round(avg * 10) / 10 },
    });
  }

  void count;
}

/* ============================================================
 * SCHÉMA DE VALIDATION
 * ============================================================ */

const SubmitReviewSchema = z.object({
  entity_type:    z.enum(["restaurant", "property", "driver", "event"]),
  entity_id:      z.string().uuid(),
  rating:         z.number().int().min(1).max(5),
  title:          z.string().max(120).optional(),
  comment:        z.string().max(2000).optional(),
  /* booking_ref_id : order_id (restaurants) ou property_booking_id (hébergements) */
  booking_ref_id: z.string().uuid().optional(),
});

/* ============================================================
 * PLUGIN
 * ============================================================ */

export const reviewsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * POST /reviews — Soumettre un avis
   *
   * Règles :
   *   1. L'utilisateur doit être authentifié.
   *   2. L'entité doit exister (restaurant/property/driver).
   *   3. L'utilisateur ne peut laisser qu'un seul avis par entité.
   *   4. Si booking_ref_id est fourni et valide → is_verified = true.
   *   5. Après insertion, rating_avg de l'entité est mis à jour.
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parse = SubmitReviewSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR", details: parse.error.flatten() });
    }

    const { entity_type, entity_id, rating, title, comment, booking_ref_id } = parse.data;
    const userId = request.user.sub;

    /* Vérifier que l'entité existe */
    let entityExists = false;
    if (entity_type === "restaurant") {
      entityExists = !!(await prisma.restaurant.findUnique({ where: { id: entity_id, deleted_at: null }, select: { id: true } }));
    } else if (entity_type === "property") {
      entityExists = !!(await prisma.property.findUnique({ where: { id: entity_id, deleted_at: null }, select: { id: true } }));
    } else if (entity_type === "driver") {
      entityExists = !!(await prisma.driver.findUnique({ where: { id: entity_id }, select: { id: true } }));
    } else if (entity_type === "event") {
      entityExists = !!(await prisma.event.findUnique({ where: { id: entity_id, status: "approved" }, select: { id: true } }));
    }

    if (!entityExists) {
      return reply.status(404).send({ error: "Entité introuvable", code: "NOT_FOUND" });
    }

    /* Un seul avis par utilisateur par entité */
    const existing = await prisma.review.findFirst({
      where: { user_id: userId, entity_type, entity_id },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ error: "Vous avez déjà laissé un avis pour cette entité", code: "ALREADY_REVIEWED" });
    }

    /* Vérification de l'achat — is_verified = true uniquement si booking valide */
    let isVerified = false;
    if (booking_ref_id) {
      if (entity_type === "restaurant") {
        /* Commande livrée de ce restaurant appartenant à cet utilisateur */
        const order = await prisma.order.findUnique({
          where: { id: booking_ref_id },
          select: { user_id: true, restaurant_id: true, status: true },
        });
        isVerified = (
          order?.user_id === userId &&
          order?.restaurant_id === entity_id &&
          order?.status === "delivered"
        );
      } else if (entity_type === "property") {
        /* Réservation terminée de cet hébergement appartenant à cet utilisateur */
        const booking = await prisma.propertyBooking.findUnique({
          where: { id: booking_ref_id },
          select: { user_id: true, property_id: true, status: true },
        });
        isVerified = (
          booking?.user_id === userId &&
          booking?.property_id === entity_id &&
          booking?.status === "completed"
        );
      } else if (entity_type === "driver") {
        /* Commande livrée par ce livreur (food) */
        const order = await prisma.order.findUnique({
          where: { id: booking_ref_id },
          select: { user_id: true, driver_id: true, status: true },
        });
        if (order?.user_id === userId && order?.driver_id === entity_id && order?.status === "delivered") {
          isVerified = true;
        } else {
          /* Course zémidjan terminée */
          const ride = await prisma.rideRequest.findUnique({
            where: { id: booking_ref_id },
            select: { user_id: true, driver_id: true, status: true },
          });
          isVerified = (
            ride?.user_id === userId &&
            ride?.driver_id === entity_id &&
            ride?.status === "completed"
          );
        }
      } else if (entity_type === "event") {
        /* Billet d'événement confirmé ou scanné */
        const booking = await prisma.eventBooking.findUnique({
          where: { id: booking_ref_id },
          select: { user_id: true, event_id: true, status: true },
        });
        isVerified = (
          booking?.user_id === userId &&
          booking?.event_id === entity_id &&
          (booking?.status === "confirmed" || booking?.status === "checked_in")
        );
      }
    }

    /* Insertion de l'avis */
    const review = await prisma.review.create({
      data: {
        user_id:        userId,
        entity_type,
        entity_id,
        rating,
        is_verified:    isVerified,
        is_visible:     true,
        ...(title          ? { title }          : {}),
        ...(comment        ? { comment }        : {}),
        ...(booking_ref_id ? { booking_ref_id } : {}),
      },
      select: {
        id: true, rating: true, title: true, comment: true,
        is_verified: true, created_at: true,
      },
    });

    /* Mettre à jour le rating_avg de l'entité parente */
    await refreshEntityRating(entity_type, entity_id);

    return reply.status(201).send({
      review: { ...review, created_at: review.created_at.toISOString() },
      message: "Votre avis a été publié",
    });
  });

  /* ============================================================
   * GET /reviews?entity_type=&entity_id=&page=
   *
   * Retourne les avis visibles d'une entité, les plus récents en premier.
   * Le prénom complet + initiale du nom sont affichés (respect vie privée).
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const query       = request.query as Record<string, string>;
    const entity_type = query["entity_type"] ?? "";
    const entity_id   = query["entity_id"]   ?? "";
    const page        = parseInt(query["page"] ?? "1", 10);
    const limit       = 10;

    if (!entity_type || !entity_id) {
      return reply.status(400).send({ error: "entity_type et entity_id sont requis", code: "MISSING_PARAMS" });
    }

    const where = { entity_type, entity_id, is_visible: true };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        select: {
          id:          true,
          rating:      true,
          title:       true,
          comment:     true,
          is_verified: true,
          response:    true,
          response_at: true,
          created_at:  true,
          user: { select: { first_name: true, last_name: true } },
        },
        orderBy: { created_at: "desc" },
        take:    limit,
        skip:    (page - 1) * limit,
      }),
      prisma.review.count({ where }),
    ]);

    return reply.status(200).send({
      reviews: reviews.map((r) => ({
        id:          r.id,
        rating:      r.rating,
        title:       r.title,
        comment:     r.comment,
        is_verified: r.is_verified,
        response:    r.response,
        response_at: r.response_at?.toISOString() ?? null,
        created_at:  r.created_at.toISOString(),
        /* Prénom + initiale du nom pour la vie privée (ex: "Kofi T.") */
        author: formatAuthor(r.user.first_name, r.user.last_name),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /reviews/eligibility — L'utilisateur peut-il noter cette entité ?
   *
   * Retourne :
   *   - already_reviewed : true si un avis existe déjà
   *   - can_review        : false si déjà noté ou non authentifié
   *   - booking_ref_id    : UUID de la référence vérifiable (si trouvée)
   * ============================================================ */
  app.get("/eligibility", async (request, reply) => {
    /* Route publique — pas d'erreur si non authentifié */
    let userId: string | null = null;
    try {
      await authenticate(request, reply);
      if (!reply.sent) userId = request.user.sub;
    } catch { /* non authentifié → can_review false */ }

    if (!userId) {
      return reply.status(200).send({ can_review: false, already_reviewed: false, reason: "unauthenticated" });
    }

    const query       = request.query as Record<string, string>;
    const entity_type = query["entity_type"] ?? "";
    const entity_id   = query["entity_id"]   ?? "";

    if (!entity_type || !entity_id) {
      return reply.status(400).send({ error: "entity_type et entity_id sont requis", code: "MISSING_PARAMS" });
    }

    /* Avis existant ? */
    const existing = await prisma.review.findFirst({
      where: { user_id: userId, entity_type, entity_id },
      select: { id: true },
    });
    if (existing) {
      return reply.status(200).send({ can_review: false, already_reviewed: true });
    }

    /* Chercher une référence vérifiable */
    let bookingRefId: string | null = null;

    if (entity_type === "restaurant") {
      const order = await prisma.order.findFirst({
        where: { user_id: userId, restaurant_id: entity_id, status: "delivered" },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });
      bookingRefId = order?.id ?? null;
    } else if (entity_type === "property") {
      const booking = await prisma.propertyBooking.findFirst({
        where: { user_id: userId, property_id: entity_id, status: "completed" },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });
      bookingRefId = booking?.id ?? null;
    } else if (entity_type === "driver") {
      /* Check food delivery first, then ride */
      const order = await prisma.order.findFirst({
        where: { user_id: userId, driver_id: entity_id, status: "delivered" },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });
      if (order) {
        bookingRefId = order.id;
      } else {
        const ride = await prisma.rideRequest.findFirst({
          where: { user_id: userId, driver_id: entity_id, status: "completed" },
          select: { id: true },
          orderBy: { requested_at: "desc" },
        });
        bookingRefId = ride?.id ?? null;
      }
    } else if (entity_type === "event") {
      const booking = await prisma.eventBooking.findFirst({
        where: { user_id: userId, event_id: entity_id, status: { in: ["confirmed", "checked_in"] } },
        select: { id: true },
        orderBy: { created_at: "desc" },
      });
      bookingRefId = booking?.id ?? null;
    }

    return reply.status(200).send({
      can_review:       true,
      already_reviewed: false,
      ...(bookingRefId ? { booking_ref_id: bookingRefId } : {}),
    });
  });
  /* ============================================================
   * PATCH /reviews/:id/response — Réponse du fournisseur à un avis
   *
   * Qui peut répondre : le propriétaire de l'entité notée.
   *   restaurant → restaurant.owner_id === userId
   *   property   → property.owner_id === userId
   *   driver     → driver.user_id === userId
   *   admin      → peut toujours répondre
   * ============================================================ */
  app.patch("/:id/response", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const { response } = z.object({ response: z.string().min(1).max(2000) }).parse(request.body);
    const userId  = request.user.sub;
    const isAdmin = request.user.roles.includes("admin");

    const review = await prisma.review.findUnique({
      where:  { id },
      select: { id: true, entity_type: true, entity_id: true, response: true },
    });

    if (!review) {
      return reply.status(404).send({ error: "Avis introuvable", code: "NOT_FOUND" });
    }

    /* Vérifier que l'appelant est bien le propriétaire de l'entité */
    if (!isAdmin) {
      let isOwner = false;
      if (review.entity_type === "restaurant") {
        const r = await prisma.restaurant.findUnique({ where: { id: review.entity_id }, select: { owner_id: true } });
        isOwner = r?.owner_id === userId;
      } else if (review.entity_type === "property") {
        const p = await prisma.property.findUnique({ where: { id: review.entity_id }, select: { owner_id: true } });
        isOwner = p?.owner_id === userId;
      } else if (review.entity_type === "driver") {
        const d = await prisma.driver.findUnique({ where: { id: review.entity_id }, select: { user_id: true } });
        isOwner = d?.user_id === userId;
      }
      if (!isOwner) {
        return reply.status(403).send({ error: "Réservé au propriétaire de l'entité", code: "AUTH_FORBIDDEN" });
      }
    }

    const updated = await prisma.review.update({
      where: { id },
      data:  { response, response_at: new Date() },
      select: { id: true, response: true, response_at: true },
    });

    return reply.status(200).send({
      review_id:   updated.id,
      response:    updated.response,
      response_at: updated.response_at?.toISOString(),
    });
  });

  /* ============================================================
   * PATCH /reviews/:id/visibility — Modération admin
   * ============================================================ */
  app.patch("/:id/visibility", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };
    const { is_visible } = z.object({ is_visible: z.boolean() }).parse(request.body);

    const review = await prisma.review.findUnique({
      where:  { id },
      select: { id: true, entity_type: true, entity_id: true },
    });

    if (!review) {
      return reply.status(404).send({ error: "Avis introuvable", code: "NOT_FOUND" });
    }

    await prisma.review.update({ where: { id }, data: { is_visible } });

    /* Recalculer le rating de l'entité après changement de visibilité */
    await refreshEntityRating(review.entity_type, review.entity_id);

    return reply.status(200).send({ review_id: id, is_visible });
  });

};

/* ============================================================
 * HELPER — Format auteur pour l'affichage public
 * "Jean" + "Dupont" → "Jean D."
 * null + null       → "Anonyme"
 * ============================================================ */

function formatAuthor(firstName: string | null, lastName: string | null): string {
  const first = firstName?.trim() ?? "";
  const last  = lastName?.trim()  ?? "";
  if (!first && !last) return "Anonyme";
  if (!last) return first;
  return `${first} ${last[0]!}.`;
}
