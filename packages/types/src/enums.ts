/**
 * enums.ts — Tous les enums du projet VIVRE
 *
 * Pourquoi des enums string (pas numériques) ?
 * Les enums numériques (0, 1, 2...) ne sont pas lisibles dans les logs ni en base.
 * Un log "status: 2" ne dit rien. "status: confirmed" est immédiatement compréhensible.
 * Prisma stocke ces valeurs en PostgreSQL ENUM — les strings sont aussi indexées efficacement.
 */

/* ============================================================
 * AUTHENTIFICATION & UTILISATEURS
 * ============================================================ */

/**
 * Rôles d'un utilisateur — un user peut avoir plusieurs rôles simultanément.
 * Ex: un propriétaire d'hôtel peut aussi être client (customer).
 */
export enum UserRole {
  CUSTOMER = "customer",   /* Client qui réserve/commande */
  SUPPLIER = "supplier",   /* Fournisseur (hôtel, restaurant, compagnie de bus, guide) */
  DRIVER = "driver",       /* Chauffeur (taxi, zémidjan) ou livreur */
  ADMIN = "admin",         /* Administrateur de la plateforme VIVRE */
}

/**
 * Objectif d'un code OTP envoyé par SMS.
 * Permet de valider côté serveur que le code est utilisé pour le bon usage.
 */
export enum OtpPurpose {
  LOGIN = "login",     /* Connexion à un compte existant */
  VERIFY = "verify",   /* Vérification initiale du numéro de téléphone */
  RESET = "reset",     /* Réinitialisation de mot de passe (futur) */
}

/* ============================================================
 * TRANSPORT INTERURBAIN — Bus longue distance
 * ============================================================ */

/**
 * Types de bus sur les liaisons interurbaines.
 * Les prix varient selon le type : minibus < standard < confort < vip.
 */
export enum BusType {
  STANDARD = "standard", /* Bus standard sans climatisation */
  CONFORT = "confort",   /* Bus climatisé avec sièges plus larges */
  VIP = "vip",           /* Bus premium avec services à bord */
  MINIBUS = "minibus",   /* Minibus pour petites liaisons */
}

/**
 * Types de passagers pour la tarification différenciée.
 * Les prix enfants et étudiants sont souvent 30-50% moins chers.
 */
export enum PassengerType {
  ADULT = "adult",
  CHILD = "child",     /* Généralement < 12 ans */
  STUDENT = "student", /* Sur présentation de carte étudiante */
}

/**
 * Statut d'un voyage (trip) en temps réel.
 * Les chauffeurs mettent à jour ce statut depuis le dashboard supplier.
 */
export enum TripStatus {
  SCHEDULED = "scheduled", /* Prévu, pas encore en embarquement */
  BOARDING = "boarding",   /* Embarquement en cours (dernier appel) */
  DEPARTED = "departed",   /* En route */
  COMPLETED = "completed", /* Arrivé à destination */
  CANCELLED = "cancelled", /* Annulé (remboursement déclenché automatiquement) */
}

/**
 * Statut d'une réservation de bus.
 * Le flux normal : pending → confirmed → completed
 * Le flux annulation : pending|confirmed → cancelled
 */
export enum BookingStatus {
  PENDING = "pending",       /* En attente de paiement (siège réservé 10 min) */
  CONFIRMED = "confirmed",   /* Paiement reçu, billet émis */
  CANCELLED = "cancelled",   /* Annulé par le client ou la compagnie */
  COMPLETED = "completed",   /* Voyage effectué */
}

/* ============================================================
 * TRANSPORT INTRAURBAIN — Taxis, zémidjans, SOTRACO
 * ============================================================ */

/**
 * Type de chauffeur intraurbain.
 * "both" = zémidjan qui fait aussi des livraisons food — réseau partagé VIVRE.
 */
export enum DriverType {
  TAXI = "taxi",
  ZEMIDJAN = "zemidjan", /* Moto-taxi — transport dominant à Ouagadougou */
  BOTH = "both",         /* Taxi ET livraison food — maximise les revenus */
}

/**
 * Type de course demandée par le client.
 */
export enum RideType {
  TAXI = "taxi",
  ZEMIDJAN = "zemidjan",
}

/**
 * Statut d'une course en temps réel.
 * Transmis via WebSocket au client et mis à jour par le driver.
 */
export enum RideStatus {
  SEARCHING = "searching",   /* En attente d'un chauffeur dans un rayon de 3km */
  ACCEPTED = "accepted",     /* Chauffeur accepté, en route vers le client */
  EN_ROUTE = "en_route",     /* Chauffeur en chemin vers le client */
  ARRIVED = "arrived",       /* Chauffeur arrivé au point de pickup */
  IN_PROGRESS = "in_progress", /* Course en cours */
  COMPLETED = "completed",   /* Course terminée et payée */
  CANCELLED = "cancelled",   /* Annulée (avant ou après acceptation) */
}

/**
 * Méthode de paiement pour les courses.
 * Cash est encore dominant à Ouagadougou — on doit toujours le supporter.
 */
export enum RidePaymentMethod {
  CASH = "cash",
  ORANGE_MONEY = "orange_money",
  MOOV = "moov",
}

/* ============================================================
 * HÉBERGEMENT
 * ============================================================ */

/**
 * Types de propriétés hébergeant des clients.
 * Reflect la réalité du marché hôtelier burkinabè.
 */
export enum PropertyType {
  HOTEL = "hotel",           /* Hôtel classé (1 à 5 étoiles) */
  AUBERGE = "auberge",       /* Auberge de jeunesse / budget */
  CAMPEMENT = "campement",   /* Campement rural (Nazinga, Tiébélé, etc.) */
  PRIVATE = "private",       /* Location privée type Airbnb */
  HOSTEL = "hostel",         /* Dortoir partagé — backpackers */
}

/**
 * Types de lits dans les chambres.
 */
export enum BedType {
  SINGLE = "single",
  DOUBLE = "double",
  TWIN = "twin",   /* Deux lits simples — souvent demandé par les professionnels */
  KING = "king",
}

/**
 * Statut d'une réservation d'hébergement.
 */
export enum PropertyBookingStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  CHECKED_IN = "checked_in",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

/* ============================================================
 * FOOD DELIVERY
 * ============================================================ */

/**
 * Types d'établissements de restauration.
 * Le "maquis" est une institution en Afrique de l'Ouest : restaurant informel
 * proposant de la cuisine locale (tô, riz gras, poulet braisé) à bas prix.
 */
export enum RestaurantType {
  RESTAURANT = "restaurant",   /* Restaurant formel */
  MAQUIS = "maquis",           /* Restaurant informel typiquement africain */
  FASTFOOD = "fastfood",       /* Fast food (Bobo Chicken, Quick, etc.) */
  BAKERY = "bakery",           /* Boulangerie-pâtisserie */
  STREET_FOOD = "street_food", /* Vendeur de rue (coupé-décalé, brochettes, etc.) */
}

/**
 * Type de commande — livraison à domicile ou retrait en restaurant.
 */
export enum OrderType {
  DELIVERY = "delivery",
  PICKUP = "pickup",
}

/**
 * Statut d'une commande food delivery.
 * Transmis en temps réel via WebSocket au client et au livreur.
 */
export enum OrderStatus {
  PENDING = "pending",       /* Commande reçue, en attente de confirmation restaurant */
  CONFIRMED = "confirmed",   /* Restaurant confirmé — préparation commence */
  PREPARING = "preparing",   /* En cuisine */
  READY = "ready",           /* Prêt, en attente du livreur */
  PICKED_UP = "picked_up",   /* Livreur a récupéré la commande */
  DELIVERED = "delivered",   /* Livré au client */
  CANCELLED = "cancelled",   /* Annulé */
}

/**
 * Méthode de paiement pour les commandes food.
 */
export enum OrderPaymentMethod {
  CASH = "cash",
  ORANGE_MONEY = "orange_money",
  MOOV = "moov",
}

/* ============================================================
 * TOURISME
 * ============================================================ */

/**
 * Catégories d'attractions touristiques.
 */
export enum AttractionCategory {
  NATURE = "nature",     /* Parcs nationaux, cascades, lacs (Karfiguéla, Tengrela) */
  CULTURE = "culture",   /* Sites culturels, danses, traditions (Tiébélé) */
  HERITAGE = "heritage", /* Patrimoine (Loropéni UNESCO, Laongo) */
  EVENT = "event",       /* Événements (FESPACO, SIAO, marchés nocturnes) */
  URBAN = "urban",       /* Attractions urbaines (marchés, quartiers) */
}

/**
 * Type de réservation d'un guide touristique.
 */
export enum GuideBookingType {
  FULL_DAY = "full_day",   /* Journée complète (8h) */
  HALF_DAY = "half_day",   /* Demi-journée (4h) */
  CUSTOM = "custom",       /* Durée personnalisée (en heures) */
}

/**
 * Statut d'une réservation de guide.
 */
export enum GuideBookingStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

/* ============================================================
 * PAIEMENTS
 * ============================================================ */

/**
 * Méthodes de paiement disponibles sur VIVRE.
 * Orange Money et Moov Money sont les plus utilisés au Burkina.
 * Wave est en expansion. Card (Stripe) pour les touristes internationaux.
 * Cash pour les zones sans connectivité mobile money.
 */
export enum PaymentMethod {
  ORANGE_MONEY = "orange_money",
  MOOV = "moov",
  WAVE = "wave",
  CARD = "card",           /* Stripe — cartes Visa/Mastercard */
  CASH = "cash",
}

/**
 * Statut d'un paiement.
 * Les paiements Mobile Money passent souvent par "processing" quelques secondes
 * pendant que l'opérateur valide la transaction USSD.
 */
export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing", /* USSD envoyé, en attente de confirmation opérateur */
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
}

/**
 * Type de réservation associée à un paiement.
 * Permet de retrouver la réservation correspondante à partir d'un paiement.
 */
export enum PaymentBookingType {
  TRANSPORT = "transport",
  PROPERTY = "property",
  FOOD = "food",
  GUIDE = "guide",
  RIDE = "ride",
}

/**
 * Statut d'un remboursement.
 */
export enum RefundStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
}

/* ============================================================
 * REVIEWS
 * ============================================================ */

/**
 * Types d'entités pouvant être évaluées.
 * Une seule table reviews gère tous les types (polymorphisme).
 * entity_type + entity_id = référence à n'importe quelle entité.
 */
export enum ReviewEntityType {
  TRANSPORT_COMPANY = "transport_company",
  PROPERTY = "property",
  RESTAURANT = "restaurant",
  GUIDE = "guide",
  DRIVER = "driver",
  ATTRACTION = "attraction",
}

/* ============================================================
 * MEDIA
 * ============================================================ */

export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
}

/* ============================================================
 * NOTIFICATIONS
 * ============================================================ */

/**
 * Canaux de notification.
 * WhatsApp est préféré au Burkina (moins cher que SMS, plus riche en contenu).
 * Push notifications = Firebase Cloud Messaging pour la PWA.
 */
export enum NotificationChannel {
  PUSH = "push",         /* Firebase Cloud Messaging → navigateur/PWA */
  SMS = "sms",           /* Twilio SMS → fallback si pas de smartphone */
  WHATSAPP = "whatsapp", /* WhatsApp Business → confirmations, tickets */
  EMAIL = "email",       /* Pour les comptes pro et admin */
}

/* ============================================================
 * SERVICES PUBLICS
 * ============================================================ */

/**
 * Slugs des catégories de services publics.
 * Les slugs sont utilisés comme identifiants stables dans l'API et le frontend.
 * Ex: /public-services?category=pharmacy retourne toutes les pharmacies.
 */
export enum PublicServiceSlug {
  HOSPITAL = "hospital",
  PHARMACY = "pharmacy",
  POLICE = "police",
  FIRE = "fire",
  TOWN_HALL = "town_hall",   /* Mairie */
  BANK = "bank",
  ATM = "atm",
  GAS_STATION = "gas_station",
  POST = "post",             /* Bureau de poste */
  SCHOOL = "school",
  UNIVERSITY = "university",
  CHURCH = "church",
  MOSQUE = "mosque",
  EMBASSY = "embassy",
}

/**
 * Types de correction crowdsourcée pour les services publics.
 * Les utilisateurs peuvent signaler des erreurs de données — vérifiées par l'admin.
 */
export enum CorrectionType {
  WRONG_ADDRESS = "wrong_address",
  WRONG_PHONE = "wrong_phone",
  CLOSED = "closed",         /* L'établissement est définitivement fermé */
  WRONG_HOURS = "wrong_hours",
  OTHER = "other",
}

/**
 * Statut d'une correction soumise.
 */
export enum CorrectionStatus {
  PENDING = "pending",     /* Soumise, en attente de revue admin */
  REVIEWED = "reviewed",   /* Vue par l'admin, pas encore appliquée */
  APPLIED = "applied",     /* Correction appliquée à la base de données */
  REJECTED = "rejected",   /* Signalement incorrect, rejeté */
}

/* ============================================================
 * PROMOTIONS
 * ============================================================ */

/**
 * Type de réduction appliqué par un code promo.
 */
export enum DiscountType {
  PERCENT = "percent",       /* Ex: -20% */
  FIXED_FCFA = "fixed_fcfa", /* Ex: -2000 FCFA */
}

/**
 * Modules auxquels un code promo peut s'appliquer.
 */
export enum PromoAppliesTo {
  ALL = "all",
  TRANSPORT = "transport",
  FOOD = "food",
  PROPERTY = "property",
  GUIDE = "guide",
}

/* ============================================================
 * SOURCES DE DONNÉES
 * ============================================================ */

/**
 * Source d'une donnée de service public.
 * Permet de savoir si la donnée est fiable (manual = vérifié) ou à valider.
 */
export enum DataSource {
  MANUAL = "manual",           /* Saisie manuelle par l'équipe VIVRE */
  OSM = "osm",                 /* OpenStreetMap — automatique mais peut être inexact */
  CROWDSOURCED = "crowdsourced", /* Soumis par un utilisateur */
}
