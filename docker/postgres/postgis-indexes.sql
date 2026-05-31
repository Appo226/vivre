-- =============================================================
-- docker/postgres/postgis-indexes.sql
--
-- Index géospatiaux PostGIS pour VIVRE.
-- Exécuter APRÈS les migrations Prisma (les tables doivent exister).
-- Ces index permettent les requêtes de proximité GPS via ST_DWithin.
--
-- Commande : psql $DATABASE_URL -f docker/postgres/postgis-indexes.sql
-- =============================================================

-- Services publics — tri par proximité GPS (urgences, pharmacies, hôpitaux)
CREATE INDEX IF NOT EXISTS idx_public_services_location
ON public_services USING GIST (
  CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography)
);

-- Restaurants — zone de livraison (rayon 5km autour du client)
CREATE INDEX IF NOT EXISTS idx_restaurants_location
ON restaurants USING GIST (
  CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography)
);

-- Hôtels — recherche par quartier ou distance au centre-ville
CREATE INDEX IF NOT EXISTS idx_properties_location
ON properties USING GIST (
  CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography)
);

-- Chauffeurs disponibles — requête temps réel dans un rayon de 3km
-- WHERE filtre les chauffeurs sans position GPS connue
CREATE INDEX IF NOT EXISTS idx_drivers_location
ON drivers USING GIST (
  CAST(ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326) AS geography)
) WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL;

SELECT 'PostGIS spatial indexes created successfully' AS result;
