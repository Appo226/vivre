/**
 * routes/users/me.ts — GET/PUT /v1/users/me
 *
 * GET  — Retourne le profil complet de l'utilisateur connecté.
 * PUT  — Met à jour le profil (prénom, nom, email, langue, avatar).
 *
 * Ces deux endpoints sont protégés par JWT (authenticate middleware).
 * L'utilisateur identifié par request.user.sub (JWT payload).
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { UpdateProfileBodySchema } from "../../schemas/auth.schema.js";

export const usersRoutes: FastifyPluginAsync = async (app) => {
  /* ============================================================
   * GET /v1/users/me — Profil de l'utilisateur connecté
   * ============================================================ */
  app.get(
    "/me",
    {
      schema: {
        summary: "Obtenir le profil de l'utilisateur connecté",
        tags: ["Utilisateurs"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      await authenticate(request, reply);
      if (reply.sent) return;

      const userId = request.user.sub;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          phone: true,
          email: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          preferred_language: true,
          is_verified: true,
          created_at: true,
          roles: {
            where: { is_approved: true },
            select: { role: true, approved_at: true },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: "Utilisateur introuvable",
          code: "USER_NOT_FOUND",
        });
      }

      return reply.status(200).send({
        id: user.id,
        phone: user.phone,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        preferred_language: user.preferred_language,
        is_verified: user.is_verified,
        roles: user.roles.map((r) => r.role),
        created_at: user.created_at,
      });
    }
  );

  /* ============================================================
   * PUT /v1/users/me — Mettre à jour le profil
   * ============================================================ */
  app.put(
    "/me",
    {
      schema: {
        summary: "Mettre à jour le profil utilisateur",
        tags: ["Utilisateurs"],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      await authenticate(request, reply);
      if (reply.sent) return;

      /* --- Validation Zod --- */
      const parseResult = UpdateProfileBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(422).send({
          error: "Données invalides",
          code: "VALIDATION_ERROR",
          details: parseResult.error.errors.map((e) => e.message).join(", "),
        });
      }

      const updates = parseResult.data;

      /* Refuser si aucun champ à mettre à jour */
      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({
          error: "Aucun champ à mettre à jour",
          code: "NO_FIELDS_PROVIDED",
        });
      }

      /* --- Vérifier l'unicité de l'email si fourni --- */
      if (updates.email) {
        const existingEmail = await prisma.user.findFirst({
          where: {
            email: updates.email,
            id: { not: request.user.sub }, /* Exclure l'utilisateur courant */
          },
        });

        if (existingEmail) {
          return reply.status(409).send({
            error: "Cet email est déjà utilisé par un autre compte.",
            code: "EMAIL_ALREADY_EXISTS",
          });
        }
      }

      /*
       * Construire l'objet data en n'incluant que les champs définis.
       * Requis avec exactOptionalPropertyTypes : une propriété `?: T` dans Prisma
       * n'accepte pas `undefined` explicitement — on doit l'omettre complètement.
       */
      const data: {
        first_name?: string;
        last_name?: string;
        email?: string | null;
        preferred_language?: string;
        avatar_url?: string | null;
      } = {};
      if (updates.first_name !== undefined) data.first_name = updates.first_name;
      if (updates.last_name !== undefined) data.last_name = updates.last_name;
      if (updates.email !== undefined) data.email = updates.email;
      if (updates.preferred_language !== undefined) data.preferred_language = updates.preferred_language;
      if (updates.avatar_url !== undefined) data.avatar_url = updates.avatar_url;

      /* --- Mise à jour en base --- */
      const updatedUser = await prisma.user.update({
        where: { id: request.user.sub },
        data,
        select: {
          id: true,
          phone: true,
          email: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          preferred_language: true,
          is_verified: true,
          roles: {
            where: { is_approved: true },
            select: { role: true },
          },
        },
      });

      return reply.status(200).send({
        user: {
          ...updatedUser,
          roles: updatedUser.roles.map((r) => r.role),
        },
      });
    }
  );

  /* ============================================================
   * GET /v1/users/me/bookings — Toutes les réservations agrégées
   *
   * Retourne les 10 dernières réservations de chaque type en parallèle,
   * normalisées dans une forme commune pour l'affichage unifié.
   * ============================================================ */
  app.get("/me/bookings", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const userId = request.user.sub;

    const [transport, properties, orders, events, rides] = await Promise.all([
      prisma.transportBooking.findMany({
        where: { user_id: userId },
        select: {
          id: true, status: true, total_amount: true, created_at: true, cancelled_at: true,
          trip: {
            select: {
              departure_datetime: true,
              route: {
                select: {
                  bus_type: true,
                  origin_city: { select: { name: true } },
                  destination_city: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      }),

      prisma.propertyBooking.findMany({
        where: { user_id: userId },
        select: {
          id: true, status: true, total_amount: true, created_at: true,
          cancelled_at: true, check_in_date: true, check_out_date: true, nights_count: true,
          property: { select: { name: true, property_type: true } },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      }),

      prisma.order.findMany({
        where: { user_id: userId },
        select: {
          id: true, status: true, total_amount: true, created_at: true, cancelled_at: true,
          restaurant: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      }),

      prisma.eventBooking.findMany({
        where: { user_id: userId },
        select: {
          id: true, status: true, total_amount: true, created_at: true, cancelled_at: true,
          event: { select: { title: true, starts_at: true, venue_name: true } },
          ticket_type: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      }),

      prisma.rideRequest.findMany({
        where: { user_id: userId },
        select: {
          id: true, status: true, ride_type: true,
          estimated_price: true, final_price: true,
          pickup_address: true, dropoff_address: true,
          requested_at: true, completed_at: true, cancelled_at: true,
        },
        orderBy: { requested_at: "desc" },
        take: 10,
      }),
    ]);

    return reply.send({
      transport: transport.map((b) => ({
        id: b.id,
        type: "transport",
        status: b.status,
        amount: b.total_amount,
        date: b.created_at,
        cancelled_at: b.cancelled_at,
        title: `${b.trip.route.origin_city.name} → ${b.trip.route.destination_city.name}`,
        subtitle: b.trip.route.bus_type,
        service_date: b.trip.departure_datetime,
        href: `/transport/mes-billets/${b.id}`,
      })),
      properties: properties.map((b) => ({
        id: b.id,
        type: "property",
        status: b.status,
        amount: b.total_amount,
        date: b.created_at,
        cancelled_at: b.cancelled_at,
        title: b.property.name,
        subtitle: `${b.nights_count} nuit${b.nights_count > 1 ? "s" : ""}`,
        service_date: new Date(b.check_in_date),
        href: `/hebergement/mes-reservations/${b.id}`,
      })),
      orders: orders.map((b) => ({
        id: b.id,
        type: "food",
        status: b.status,
        amount: b.total_amount,
        date: b.created_at,
        cancelled_at: b.cancelled_at,
        title: b.restaurant.name,
        subtitle: "Commande",
        service_date: b.created_at,
        href: `/food/mes-commandes/${b.id}`,
      })),
      events: events.map((b) => ({
        id: b.id,
        type: "event",
        status: b.status,
        amount: b.total_amount,
        date: b.created_at,
        cancelled_at: b.cancelled_at,
        title: b.event.title,
        subtitle: b.ticket_type.name,
        service_date: b.event.starts_at,
        href: `/evenements/mes-billets/${b.id}`,
      })),
      rides: rides.map((b) => ({
        id: b.id,
        type: "ride",
        status: b.status,
        amount: b.final_price ?? b.estimated_price,
        date: b.requested_at,
        cancelled_at: b.cancelled_at,
        title: b.dropoff_address ?? "Course",
        subtitle: b.ride_type === "taxi" ? "Taxi" : "Zémidjan",
        service_date: b.requested_at,
        href: `/course/${b.id}`,
      })),
    });
  });
};
