-- =============================================================
-- docker/postgres/init.sql — Script d'initialisation PostgreSQL
--
-- Exécuté une seule fois lors de la création du volume Docker PostgreSQL.
-- Ce script configure les extensions requises et crée les index géospatiaux
-- que Prisma ne peut pas créer nativement (PostGIS GIST indexes).
--
-- IMPORTANT : Ce script est IDEMPOTENT — il peut être ré-exécuté sans erreur
-- grâce aux clauses "IF NOT EXISTS" et "CREATE EXTENSION IF NOT EXISTS".
-- =============================================================

-- =============================================================
-- EXTENSIONS POSTGRESQL
-- =============================================================

-- PostGIS : Extension géospatiale pour les requêtes de distance et proximité.
-- Requise pour trier les services publics par distance GPS (ST_Distance).
-- Aussi utilisée pour les zones de couverture des restaurants (ST_DWithin).
CREATE EXTENSION IF NOT EXISTS postgis;

-- uuid-ossp : Génération d'UUIDs côté PostgreSQL.
-- Prisma génère ses propres UUIDs, mais cette extension est utile
-- pour les triggers et fonctions PostgreSQL qui ont besoin d'UUIDs.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_trgm : Extension de recherche par trigrammes (recherche floue).
-- Utilisée pour la recherche textuelle de restaurants, hôtels, attractions.
-- Ex: "hôtel" trouve aussi "hotel" (accent insensitif).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent : Supprime les accents pour la recherche (é → e, ü → u).
-- Permet à "ouagadougou" de retrouver "Ouagadougou" dans la recherche.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =============================================================
-- COMMENTAIRES SUR LES EXTENSIONS
-- =============================================================

COMMENT ON EXTENSION postgis IS
  'Fonctions géospatiales pour VIVRE : ST_Distance, ST_DWithin, ST_Within';

COMMENT ON EXTENSION "uuid-ossp" IS
  'Génération d UUID v4 pour les triggers PostgreSQL';

COMMENT ON EXTENSION pg_trgm IS
  'Recherche floue textuelle pour restaurants, hôtels, attractions';

-- =============================================================
-- CONFIGURATION POSTGRESQL POUR VIVRE
-- =============================================================

-- Augmenter le max_connections pour le développement (par défaut: 100)
-- En production: géré par PgBouncer (pooler de connexions)
-- ALTER SYSTEM SET max_connections = 200;

-- Configuration du search_path par défaut
-- public = schéma par défaut de Prisma
ALTER ROLE vivre_user SET search_path TO public;

-- =============================================================
-- INDEX GÉOSPATIAUX POSTGIS
-- (créés ici car Prisma ne supporte pas les index GIST nativement)
-- Ces index sont créés APRÈS les migrations Prisma — voir les commentaires.
-- =============================================================

-- NOTE : Ces index doivent être créés APRÈS que Prisma ait créé les tables.
-- Exécuter ce bloc via : pnpm db:migrate && psql $DATABASE_URL -f docker/postgres/init-indexes.sql
-- Nous commentons les CREATE INDEX ici pour éviter les erreurs "relation does not exist"
-- lors de l'initialisation de la DB vide (avant les migrations Prisma).

-- Les index PostGIS à créer après les migrations :
--
-- Index géospatial sur les services publics (recherche par proximité GPS)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_public_services_location
-- ON public_services USING GIST (
--   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
-- );
--
-- Index géospatial sur les restaurants (livraison dans un rayon)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_restaurants_location
-- ON restaurants USING GIST (
--   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
-- );
--
-- Index géospatial sur les propriétés (hôtels dans une zone)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_location
-- ON properties USING GIST (
--   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
-- );
--
-- Index géospatial sur les chauffeurs (disponibles dans un rayon de 3km)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_location
-- ON drivers USING GIST (
--   ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)::geography
-- ) WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL;

-- =============================================================
-- TRIGGERS POSTGRESQL
-- =============================================================

-- Trigger de mise à jour du rating_avg sur les entités parentales.
-- Déclenché après chaque INSERT ou UPDATE sur la table reviews.
-- NB: ce trigger sera implémenté à l'Étape 12 (Reviews) une fois
-- que les tables cibles sont créées par les migrations Prisma.

-- =============================================================
-- MESSAGE DE CONFIRMATION
-- =============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ PostgreSQL VIVRE initialisé avec succès';
  RAISE NOTICE '   Extensions activées : PostGIS, uuid-ossp, pg_trgm, unaccent';
  RAISE NOTICE '   Prochaine étape : pnpm db:migrate && pnpm db:seed';
END $$;
