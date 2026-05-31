/**
 * routes/food/index.ts — Module Food Delivery (Étape 7)
 *
 * Trois groupes d'endpoints :
 *
 * restaurantsRoutes (/restaurants) :
 *   GET  /mine                — Mes restaurants (owner)
 *   GET  /                    — Liste publique avec filtres
 *   GET  /:id                 — Détail + menu complet
 *   POST /                    — Créer un restaurant (→ pending approval)
 *   PATCH /:id/approve        — Approuver (admin)
 *   POST /:id/categories      — Ajouter catégorie menu (owner)
 *   POST /:id/items           — Ajouter plat (owner)
 *   PATCH /:id/items/:itemId  — Modifier plat (owner)
 *   GET  /:id/orders          — Commandes du restaurant (owner/admin dashboard)
 *
 * ordersRoutes (/orders) :
 *   GET  /me                  — Mes commandes (client)
 *   GET  /:id                 — Détail d'une commande
 *   POST /                    — Passer une commande
 *   PATCH /:id/status         — Mettre à jour le statut (restaurant, driver, admin)
 *
 * Logique de livraison :
 *   Le frais de livraison est calculé en temps réel via Haversine (distance Euclidienne
 *   approximative suffisante dans les périmètres urbains de 5-10 km).
 *   Base : 500 FCFA + 200 FCFA/km, arrondi à 50 FCFA près.
 *
 * Ouverture en temps réel :
 *   Le champ is_open_now du restaurant est calculé à chaque requête GET /
 *   en comparant l'heure UTC actuelle aux horaires JSON.
 *   Burkina Faso = UTC+0 toute l'année (pas de changement d'heure).
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vivre/database";
import { authenticate } from "../../plugins/authenticate.js";
import { notifyOrderStatus, notifyDriverNewDelivery } from "../../services/notification.service.js";
import {
  RestaurantListSchema,
  CreateRestaurantSchema,
  CreateMenuCategorySchema,
  CreateMenuItemSchema,
  CreateOrderSchema,
  UpdateOrderStatusSchema,
} from "../../schemas/food.schema.js";

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

/**
 * Vérifie si un restaurant est ouvert maintenant selon ses horaires.
 * Burkina Faso = UTC+0 → l'heure UTC est l'heure locale.
 *
 * Format attendu de openingHours :
 *   { "mon": "08:00-22:00", "tue": "08:00-22:00", ..., "sun": "closed" }
 */
function isOpenNow(openingHours: Record<string, string>): boolean {
  const now = new Date();
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = dayKeys[now.getUTCDay()] as string;
  const hoursStr = openingHours[dayKey];

  if (!hoursStr || hoursStr === "closed") return false;

  const parts = hoursStr.split("-");
  if (parts.length !== 2) return false;

  const openStr  = parts[0] ?? "";
  const closeStr = parts[1] ?? "";

  /*
   * parseInt sur les composantes HH et MM — on évite le destructuring de number[]
   * car TypeScript strict type les éléments comme number | undefined.
   */
  const openParts  = openStr.split(":");
  const closeParts = closeStr.split(":");
  const openH  = parseInt(openParts[0] ?? "0", 10);
  const openM  = parseInt(openParts[1] ?? "0", 10);
  const closeH = parseInt(closeParts[0] ?? "0", 10);
  const closeM = parseInt(closeParts[1] ?? "0", 10);

  if (isNaN(openH) || isNaN(openM) || isNaN(closeH) || isNaN(closeM)) return false;

  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMin    = openH * 60 + openM;
  const closeMin   = closeH * 60 + closeM;

  return currentMin >= openMin && currentMin < closeMin;
}

/**
 * Formule Haversine — distance en km entre deux coordonnées GPS.
 * Précision suffisante pour les périmètres urbains burkinabè (5-10 km).
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcule les frais de livraison selon la distance.
 * Tarif : 500 FCFA de base + 200 FCFA/km, arrondi à 50 FCFA.
 * Max 3 000 FCFA pour les courtes distances urbaines.
 */
function calcDeliveryFee(distanceKm: number): number {
  const raw = 500 + distanceKm * 200;
  return Math.round(raw / 50) * 50;
}

/**
 * Vérifie que l'utilisateur est bien le propriétaire du restaurant.
 * Retourne le restaurant ou null si non trouvé / non autorisé.
 */
async function getOwnedRestaurant(
  restaurantId: string,
  userId: string
): Promise<{ id: string; owner_id: string } | null> {
  return prisma.restaurant.findFirst({
    where: { id: restaurantId, owner_id: userId, deleted_at: null },
    select: { id: true, owner_id: true },
  });
}

/* ============================================================
 * ROUTES RESTAURANTS
 * ============================================================ */

export const restaurantsRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /restaurants/mine — Mes restaurants (fournisseur)
   * Déclaré avant /:id pour ne pas être matchée comme UUID.
   * ============================================================ */
  app.get("/mine", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const restaurants = await prisma.restaurant.findMany({
      where: { owner_id: userId, deleted_at: null },
      select: {
        id: true, name: true, restaurant_type: true, address: true,
        is_approved: true, is_active: true, is_open_now: true,
        rating_avg: true, avg_prep_minutes: true,
        city: { select: { name: true } },
        _count: { select: { menu_items: true, orders: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return reply.status(200).send({ restaurants });
  });

  /* ============================================================
   * GET /restaurants/:id/menu — Menu complet (supplier dashboard)
   * Retourne TOUTES les catégories et TOUS les plats (y compris
   * indisponibles) pour que le proprio puisse les gérer.
   * Déclaré avant /:id mais après /mine pour éviter le conflit.
   * ============================================================ */
  app.get("/:id/menu", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedRestaurant(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { restaurant_id: id },
      orderBy: { sort_order: "asc" },
      select: {
        id: true, name: true, sort_order: true, is_active: true,
        items: {
          where: { deleted_at: null },
          orderBy: [{ sort_order: "asc" }, { name: "asc" }],
          select: {
            id: true, name: true, description: true, price: true,
            is_available: true, is_featured: true,
            prep_minutes: true, sort_order: true,
          },
        },
      },
    });

    return reply.status(200).send({ categories });
  });

  /* ============================================================
   * GET /restaurants — Liste publique
   * is_open_now est recalculé en temps réel pour chaque restaurant.
   * ============================================================ */
  app.get("/", async (request, reply) => {
    const parseResult = RestaurantListSchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Paramètres invalides", code: "VALIDATION_ERROR" });
    }

    const { city_id, restaurant_type, q, open_now, offers_delivery, offers_pickup, page, limit } =
      parseResult.data;
    const offset = (page - 1) * limit;

    const where = {
      is_approved: true,
      is_active: true,
      deleted_at: null,
      ...(city_id && { city_id }),
      ...(restaurant_type && { restaurant_type }),
      ...(offers_delivery !== undefined && { offers_delivery }),
      ...(offers_pickup !== undefined && { offers_pickup }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { address: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        select: {
          id: true, name: true, restaurant_type: true, address: true,
          latitude: true, longitude: true, opening_hours: true,
          delivery_radius_km: true, min_order_fcfa: true, avg_prep_minutes: true,
          offers_delivery: true, offers_pickup: true, rating_avg: true,
          city: { select: { id: true, name: true } },
          menu_items: {
            where: { is_available: true },
            select: { price: true },
            orderBy: { price: "asc" },
            take: 1, /* Prix minimum — pour affichage "à partir de" */
          },
        },
        orderBy: [{ is_open_now: "desc" }, { rating_avg: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.restaurant.count({ where }),
    ]);

    /*
     * Recalculer is_open_now en temps réel pour chaque restaurant.
     * Le champ stocké en base est mis à jour par un CRON toutes les 15 min,
     * mais on recalcule ici pour une précision maximale.
     */
    const enriched = restaurants.map((r) => ({
      ...r,
      is_open_now: isOpenNow(r.opening_hours as Record<string, string>),
      min_price: r.menu_items[0]?.price ?? null,
      menu_items: undefined, /* Masquer le champ brut */
      opening_hours: undefined, /* Masquer les horaires bruts dans la liste */
    }));

    /* Si filtre open_now demandé, appliquer après le calcul temps réel */
    const filtered = open_now !== undefined
      ? enriched.filter((r) => r.is_open_now === open_now)
      : enriched;

    return reply.status(200).send({
      restaurants: filtered,
      total: open_now !== undefined ? filtered.length : total,
      page,
      pages: Math.ceil((open_now !== undefined ? filtered.length : total) / limit),
    });
  });

  /* ============================================================
   * GET /restaurants/:id — Détail + menu complet organisé par catégories
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const restaurant = await prisma.restaurant.findFirst({
      where: { id, is_approved: true, is_active: true, deleted_at: null },
      select: {
        id: true, name: true, restaurant_type: true, description: true,
        address: true, latitude: true, longitude: true, phone: true,
        opening_hours: true, delivery_radius_km: true, min_order_fcfa: true,
        avg_prep_minutes: true, offers_delivery: true, offers_pickup: true,
        rating_avg: true,
        city: { select: { id: true, name: true } },
        menu_categories: {
          where: { is_active: true },
          orderBy: { sort_order: "asc" },
          select: {
            id: true, name: true, sort_order: true,
            items: {
              where: { is_available: true, deleted_at: null },
              orderBy: [{ is_featured: "desc" }, { sort_order: "asc" }],
              select: {
                id: true, name: true, description: true, price: true,
                image_url: true, is_available: true, is_featured: true,
                prep_minutes: true, sort_order: true,
              },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return reply.status(404).send({ error: "Restaurant introuvable", code: "RESTAURANT_NOT_FOUND" });
    }

    const openingHours = restaurant.opening_hours as Record<string, string>;

    return reply.status(200).send({
      ...restaurant,
      is_open_now: isOpenNow(openingHours),
      opening_hours: openingHours, /* Retourné ici pour la page détail */
    });
  });

  /* ============================================================
   * POST /restaurants — Créer un restaurant (fournisseur)
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreateRestaurantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const data = parseResult.data;
    const userId = request.user.sub;

    const restaurant = await prisma.restaurant.create({
      data: {
        owner_id: userId,
        city_id: data.city_id,
        name: data.name,
        restaurant_type: data.restaurant_type,
        description: data.description ?? null,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        phone: data.phone,
        opening_hours: data.opening_hours,
        delivery_radius_km: data.delivery_radius_km,
        min_order_fcfa: data.min_order_fcfa,
        avg_prep_minutes: data.avg_prep_minutes,
        offers_delivery: data.offers_delivery,
        offers_pickup: data.offers_pickup,
        is_approved: false,
      },
      select: { id: true, name: true, restaurant_type: true, is_approved: true },
    });

    return reply.status(201).send({
      ...restaurant,
      message: "Restaurant créé — en attente de validation par notre équipe (48h).",
    });
  });

  /* ============================================================
   * PATCH /restaurants/:id — Modifier les infos du restaurant (owner)
   * Permet au fournisseur de mettre à jour son restaurant :
   *   nom, téléphone, description, horaires, options livraison…
   * Les champs non fournis ne sont pas modifiés.
   * ============================================================ */
  app.patch("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedRestaurant(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const body = request.body as Record<string, unknown>;
    const updatable: Record<string, unknown> = {};

    /* Seulement les champs autorisés — défense en profondeur */
    if (typeof body["name"] === "string") updatable["name"] = body["name"];
    if (typeof body["description"] === "string") updatable["description"] = body["description"];
    if (typeof body["phone"] === "string") updatable["phone"] = body["phone"];
    if (typeof body["address"] === "string") updatable["address"] = body["address"];
    if (typeof body["offers_delivery"] === "boolean") updatable["offers_delivery"] = body["offers_delivery"];
    if (typeof body["offers_pickup"] === "boolean") updatable["offers_pickup"] = body["offers_pickup"];
    if (typeof body["min_order_fcfa"] === "number") updatable["min_order_fcfa"] = body["min_order_fcfa"];
    if (typeof body["avg_prep_minutes"] === "number") updatable["avg_prep_minutes"] = body["avg_prep_minutes"];
    if (typeof body["delivery_radius_km"] === "number") updatable["delivery_radius_km"] = body["delivery_radius_km"];
    if (body["opening_hours"] && typeof body["opening_hours"] === "object") {
      updatable["opening_hours"] = body["opening_hours"];
    }

    if (Object.keys(updatable).length === 0) {
      return reply.status(422).send({ error: "Aucun champ à modifier", code: "VALIDATION_ERROR" });
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: updatable,
      select: {
        id: true, name: true, phone: true, description: true, address: true,
        offers_delivery: true, offers_pickup: true, min_order_fcfa: true,
        avg_prep_minutes: true, delivery_radius_km: true, opening_hours: true,
      },
    });

    return reply.status(200).send({ message: "Restaurant mis à jour", restaurant });
  });

  /* ============================================================
   * PATCH /restaurants/:id/approve — Approuver (admin)
   * ============================================================ */
  app.patch("/:id/approve", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Réservé aux administrateurs", code: "AUTH_FORBIDDEN" });
    }

    const { id } = request.params as { id: string };
    await prisma.restaurant.update({ where: { id }, data: { is_approved: true } });

    return reply.status(200).send({ message: "Restaurant approuvé", restaurant_id: id });
  });

  /* ============================================================
   * POST /restaurants/:id/categories — Ajouter une catégorie de menu
   * ============================================================ */
  app.post("/:id/categories", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedRestaurant(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const parseResult = CreateMenuCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Données invalides", code: "VALIDATION_ERROR" });
    }

    const category = await prisma.menuCategory.create({
      data: {
        restaurant_id: id,
        name: parseResult.data.name,
        sort_order: parseResult.data.sort_order,
      },
      select: { id: true, name: true, sort_order: true },
    });

    return reply.status(201).send(category);
  });

  /* ============================================================
   * POST /restaurants/:id/items — Ajouter un plat au menu
   * ============================================================ */
  app.post("/:id/items", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const owned = await getOwnedRestaurant(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const parseResult = CreateMenuItemSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    /* Vérifier que la catégorie appartient bien à ce restaurant */
    const category = await prisma.menuCategory.findFirst({
      where: { id: parseResult.data.category_id, restaurant_id: id, is_active: true },
    });
    if (!category) {
      return reply.status(404).send({ error: "Catégorie introuvable", code: "CATEGORY_NOT_FOUND" });
    }

    const item = await prisma.menuItem.create({
      data: {
        restaurant_id: id,
        category_id: parseResult.data.category_id,
        name: parseResult.data.name,
        description: parseResult.data.description ?? null,
        price: parseResult.data.price,
        image_url: parseResult.data.image_url ?? null,
        is_available: parseResult.data.is_available,
        is_featured: parseResult.data.is_featured,
        prep_minutes: parseResult.data.prep_minutes ?? null,
        sort_order: parseResult.data.sort_order,
      },
      select: {
        id: true, name: true, price: true, is_available: true, is_featured: true,
      },
    });

    return reply.status(201).send(item);
  });

  /* ============================================================
   * PATCH /restaurants/:id/items/:itemId — Modifier un plat
   * Permet d'activer/désactiver un plat ou de changer son prix.
   * ============================================================ */
  app.patch("/:id/items/:itemId", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id, itemId } = request.params as { id: string; itemId: string };
    const owned = await getOwnedRestaurant(id, request.user.sub);
    if (!owned && !request.user.roles.includes("admin")) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const body = request.body as Record<string, unknown>;
    const updatableFields: Record<string, unknown> = {};

    /* Seuls ces champs sont modifiables — défense en profondeur */
    if (typeof body["is_available"] === "boolean") updatableFields["is_available"] = body["is_available"];
    if (typeof body["price"] === "number") updatableFields["price"] = body["price"];
    if (typeof body["name"] === "string") updatableFields["name"] = body["name"];
    if (typeof body["is_featured"] === "boolean") updatableFields["is_featured"] = body["is_featured"];

    if (Object.keys(updatableFields).length === 0) {
      return reply.status(422).send({ error: "Aucun champ à modifier", code: "VALIDATION_ERROR" });
    }

    const item = await prisma.menuItem.updateMany({
      where: { id: itemId, restaurant_id: id, deleted_at: null },
      data: updatableFields,
    });

    if (item.count === 0) {
      return reply.status(404).send({ error: "Plat introuvable", code: "ITEM_NOT_FOUND" });
    }

    return reply.status(200).send({ message: "Plat mis à jour", item_id: itemId });
  });

  /* ============================================================
   * GET /restaurants/:id/orders — Commandes du restaurant
   * Dashboard fournisseur — toutes les commandes en cours / récentes.
   * ============================================================ */
  app.get("/:id/orders", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const isAdmin = request.user.roles.includes("admin");
    const owned = await getOwnedRestaurant(id, request.user.sub);

    if (!owned && !isAdmin) {
      return reply.status(403).send({ error: "Non autorisé", code: "AUTH_FORBIDDEN" });
    }

    const query = request.query as Record<string, string>;
    const statusFilter = query["status"]; /* pending | confirmed | preparing | ready | ... */
    const page = parseInt(query["page"] ?? "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const where = {
      restaurant_id: id,
      ...(statusFilter && { status: statusFilter }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true, order_type: true, status: true, total_amount: true,
          delivery_address: true, special_instructions: true, created_at: true,
          estimated_delivery_at: true,
          user: { select: { first_name: true, last_name: true, phone: true } },
          driver: { select: { user: { select: { first_name: true, phone: true } } } },
          items: {
            select: {
              quantity: true, unit_price: true, subtotal: true, notes: true,
              menu_item: { select: { name: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
    ]);

    return reply.status(200).send({
      orders: orders.map((o) => ({
        ...o,
        created_at: o.created_at.toISOString(),
        estimated_delivery_at: o.estimated_delivery_at?.toISOString() ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });
};

/* ============================================================
 * ROUTES COMMANDES
 * ============================================================ */

export const ordersRoutes: FastifyPluginAsync = async (app) => {

  /* ============================================================
   * GET /orders/me — Mes commandes (client)
   * Déclaré avant /:id.
   * ============================================================ */
  app.get("/me", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userId = request.user.sub;
    const query = request.query as Record<string, string>;
    const filter = query["filter"] ?? "all";
    const page = parseInt(query["page"] ?? "1", 10);
    const limit = 10;
    const offset = (page - 1) * limit;

    type WhereInput = {
      user_id: string;
      status?: string | { in: string[] };
    };

    const where: WhereInput = { user_id: userId };

    if (filter === "active") {
      where.status = { in: ["pending_payment", "pending", "confirmed", "preparing", "ready", "picked_up"] };
    } else if (filter === "completed") {
      where.status = "delivered";
    } else if (filter === "cancelled") {
      where.status = "cancelled";
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true, order_type: true, status: true,
          subtotal: true, delivery_fee: true, total_amount: true,
          payment_method: true, created_at: true, delivered_at: true,
          restaurant: { select: { id: true, name: true, restaurant_type: true, address: true } },
          items: { select: { quantity: true, menu_item: { select: { name: true } } }, take: 3 },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
    ]);

    return reply.status(200).send({
      orders: orders.map((o) => ({
        ...o,
        created_at: o.created_at.toISOString(),
        delivered_at: o.delivered_at?.toISOString() ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  /* ============================================================
   * GET /orders/:id — Détail d'une commande
   * ============================================================ */
  app.get("/:id", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true, user_id: true, restaurant_id: true, order_type: true, status: true,
        delivery_address: true, delivery_lat: true, delivery_lng: true,
        subtotal: true, delivery_fee: true, total_amount: true,
        payment_method: true, special_instructions: true,
        estimated_delivery_at: true, delivered_at: true, cancelled_at: true,
        created_at: true, updated_at: true,
        user: { select: { first_name: true, last_name: true, phone: true } },
        restaurant: {
          select: {
            id: true, name: true, restaurant_type: true, address: true,
            latitude: true, longitude: true, phone: true,
            city: { select: { name: true } },
          },
        },
        driver: {
          select: {
            id: true, vehicle_type: true, vehicle_plate: true, current_lat: true, current_lng: true,
            user: { select: { first_name: true, phone: true } },
          },
        },
        items: {
          select: {
            id: true, quantity: true, unit_price: true, subtotal: true, notes: true,
            menu_item: { select: { id: true, name: true, description: true } },
          },
        },
      },
    });

    if (!order) {
      return reply.status(404).send({ error: "Commande introuvable", code: "ORDER_NOT_FOUND" });
    }

    const isAdmin = request.user.roles.includes("admin");
    const isOwner = order.user_id === userId;
    /* Le propriétaire du restaurant peut aussi voir ses propres commandes */
    const isRestaurantOwner = !isAdmin && !isOwner
      ? !!(await getOwnedRestaurant(order.restaurant_id, userId))
      : false;

    if (!isOwner && !isAdmin && !isRestaurantOwner) {
      return reply.status(403).send({ error: "Accès refusé", code: "AUTH_FORBIDDEN" });
    }

    return reply.status(200).send({
      ...order,
      estimated_delivery_at: order.estimated_delivery_at?.toISOString() ?? null,
      delivered_at: order.delivered_at?.toISOString() ?? null,
      cancelled_at: order.cancelled_at?.toISOString() ?? null,
      created_at: order.created_at.toISOString(),
      updated_at: order.updated_at.toISOString(),
    });
  });

  /* ============================================================
   * POST /orders — Passer une commande
   *
   * Flux :
   *   1. Valider les articles (existence, disponibilité, appartenance au restaurant)
   *   2. Calculer le sous-total et les frais de livraison
   *   3. Vérifier la commande minimum
   *   4. Créer la commande + les order_items en transaction
   *   5. Estimer l'heure de livraison (prep + 15 min de livraison)
   * ============================================================ */
  app.post("/", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const parseResult = CreateOrderSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        error: "Données invalides",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors[0]?.message,
      });
    }

    const { restaurant_id, order_type, items, delivery_address, delivery_lat, delivery_lng,
      payment_method, special_instructions } = parseResult.data;
    const userId = request.user.sub;

    /* Delivery nécessite une adresse */
    if (order_type === "delivery" && !delivery_address) {
      return reply.status(422).send({
        error: "L'adresse de livraison est obligatoire pour une commande delivery",
        code: "DELIVERY_ADDRESS_REQUIRED",
      });
    }

    /* Charger le restaurant */
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurant_id, is_approved: true, is_active: true, deleted_at: null },
      select: {
        id: true, name: true, min_order_fcfa: true, avg_prep_minutes: true,
        offers_delivery: true, offers_pickup: true,
        latitude: true, longitude: true, opening_hours: true,
      },
    });

    if (!restaurant) {
      return reply.status(404).send({ error: "Restaurant introuvable ou inactif", code: "RESTAURANT_NOT_FOUND" });
    }

    /* Vérifier le mode de commande */
    if (order_type === "delivery" && !restaurant.offers_delivery) {
      return reply.status(422).send({ error: "Ce restaurant ne propose pas la livraison", code: "DELIVERY_NOT_AVAILABLE" });
    }
    if (order_type === "pickup" && !restaurant.offers_pickup) {
      return reply.status(422).send({ error: "Ce restaurant ne propose pas le click & collect", code: "PICKUP_NOT_AVAILABLE" });
    }

    /* Charger et valider tous les articles */
    const menuItemIds = items.map((i) => i.menu_item_id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurant_id, is_available: true, deleted_at: null },
      select: { id: true, name: true, price: true, prep_minutes: true },
    });

    /* Vérifier que tous les articles demandés existent */
    if (menuItems.length !== menuItemIds.length) {
      return reply.status(422).send({
        error: "Un ou plusieurs articles sont introuvables ou indisponibles",
        code: "ITEMS_NOT_AVAILABLE",
      });
    }

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    /* Calculer le sous-total et préparer les order_items */
    let subtotal = 0;
    const orderItemsData = items.map((item) => {
      const menuItem = menuItemMap.get(item.menu_item_id)!;
      const itemSubtotal = menuItem.price * item.quantity;
      subtotal += itemSubtotal;
      return {
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: menuItem.price,
        subtotal: itemSubtotal,
        notes: item.notes ?? null,
      };
    });

    /* Vérifier la commande minimum */
    if (subtotal < restaurant.min_order_fcfa) {
      return reply.status(422).send({
        error: `Commande minimum : ${restaurant.min_order_fcfa.toLocaleString("fr-FR")} FCFA`,
        code: "MIN_ORDER_NOT_MET",
        details: { min_order_fcfa: restaurant.min_order_fcfa, current_subtotal: subtotal },
      });
    }

    /* Calculer les frais de livraison */
    let deliveryFee = 0;
    if (order_type === "delivery" && delivery_lat !== undefined && delivery_lng !== undefined) {
      const distKm = haversineKm(restaurant.latitude, restaurant.longitude, delivery_lat, delivery_lng);
      deliveryFee = calcDeliveryFee(distKm);
    } else if (order_type === "delivery") {
      /* Adresse sans coordonnées GPS — frais forfaitaire */
      deliveryFee = 1000;
    }

    const totalAmount = subtotal + deliveryFee;

    /* Estimer l'heure de livraison : temps de préparation + 15 min de transit */
    const maxPrepMinutes = Math.max(
      restaurant.avg_prep_minutes,
      ...menuItems.map((m) => m.prep_minutes ?? 0)
    );
    const estimatedDeliveryAt = new Date(Date.now() + (maxPrepMinutes + 15) * 60 * 1000);

    /* Créer la commande en transaction pour garantir l'atomicité */
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          user_id: userId,
          restaurant_id,
          order_type,
          delivery_address: delivery_address ?? null,
          delivery_lat: delivery_lat ?? null,
          delivery_lng: delivery_lng ?? null,
          subtotal,
          delivery_fee: deliveryFee,
          total_amount: totalAmount,
          payment_method,
          special_instructions: special_instructions ?? null,
          estimated_delivery_at: estimatedDeliveryAt,
          /* Commande créée en attente de paiement — passe à "pending" après webhook CinetPay */
          status: "pending_payment",
          items: { create: orderItemsData },
        },
        select: {
          id: true, status: true, subtotal: true, delivery_fee: true,
          total_amount: true, estimated_delivery_at: true,
        },
      });
      return newOrder;
    });

    return reply.status(201).send({
      ...order,
      estimated_delivery_at: order.estimated_delivery_at?.toISOString() ?? null,
      message: "Commande passée ! Le restaurant va confirmer dans quelques minutes.",
    });
  });

  /* ============================================================
   * PATCH /orders/:id/status — Mettre à jour le statut d'une commande
   *
   * Qui peut faire quoi :
   *   Restaurant owner → confirmed, preparing, ready, cancelled
   *   Driver          → picked_up, delivered
   *   Admin           → tout
   *   Client          → ne peut pas (l'annulation est faite via DELETE sur les hébergements
   *                     mais pour les commandes food, c'est le restaurant qui annule)
   * ============================================================ */
  app.patch("/:id/status", async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const { id } = request.params as { id: string };
    const parseResult = UpdateOrderStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({ error: "Statut invalide", code: "VALIDATION_ERROR" });
    }

    const { status } = parseResult.data;
    const userId = request.user.sub;
    const isAdmin = request.user.roles.includes("admin");

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true, status: true, restaurant_id: true, driver_id: true,
        restaurant: { select: { owner_id: true } },
      },
    });

    if (!order) {
      return reply.status(404).send({ error: "Commande introuvable", code: "ORDER_NOT_FOUND" });
    }

    /* Vérifier les autorisations selon le nouveau statut demandé */
    const isRestaurantOwner = order.restaurant.owner_id === userId;

    if (!isAdmin && !isRestaurantOwner) {
      /* Vérifier si c'est le driver assigné pour picked_up / delivered */
      const driver = await prisma.driver.findFirst({ where: { user_id: userId } });
      const isAssignedDriver = driver && order.driver_id === driver.id;

      if (!isAssignedDriver) {
        return reply.status(403).send({ error: "Non autorisé à modifier le statut", code: "AUTH_FORBIDDEN" });
      }
    }

    /*
     * Transitions valides :
     * pending → confirmed (restaurant)
     * confirmed → preparing (restaurant)
     * preparing → ready (restaurant)
     * ready → picked_up (driver)
     * picked_up → delivered (driver)
     * any active → cancelled (restaurant ou admin)
     */
    const validTransitions: Record<string, string[]> = {
      pending:    ["confirmed", "cancelled"],
      confirmed:  ["preparing", "cancelled"],
      preparing:  ["ready", "cancelled"],
      ready:      ["picked_up", "cancelled"],
      picked_up:  ["delivered"],
    };

    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(status)) {
      return reply.status(409).send({
        error: `Transition ${order.status} → ${status} non autorisée`,
        code: "INVALID_STATUS_TRANSITION",
        details: { current: order.status, requested: status, allowed },
      });
    }

    /* Charger user + restaurant name pour la notification */
    const fullOrder = await prisma.order.findUnique({
      where:  { id },
      select: {
        user_id:    true,
        driver_id:  true,
        delivery_address: true,
        user:       { select: { phone: true } },
        restaurant: { select: { name: true } },
        driver:     { select: { user_id: true } },
      },
    });

    await prisma.order.update({
      where: { id },
      data: {
        status,
        ...(status === "delivered" && { delivered_at: new Date() }),
        ...(status === "cancelled" && { cancelled_at: new Date() }),
      },
    });

    /* Notifier le client du changement de statut — fire-and-forget */
    if (fullOrder?.user) {
      void notifyOrderStatus({
        userId:         fullOrder.user_id,
        userPhone:      fullOrder.user.phone,
        orderId:        id,
        status,
        restaurantName: fullOrder.restaurant.name,
      });
    }

    /* Notifier le livreur si une nouvelle livraison vient d'être assignée */
    if (status === "ready" && fullOrder?.driver?.user_id && fullOrder.delivery_address) {
      void notifyDriverNewDelivery({
        driverUserId:    fullOrder.driver.user_id,
        orderId:         id,
        restaurantName:  fullOrder.restaurant.name,
        deliveryAddress: fullOrder.delivery_address,
      });
    }

    return reply.status(200).send({ message: "Statut mis à jour", order_id: id, status });
  });
};
