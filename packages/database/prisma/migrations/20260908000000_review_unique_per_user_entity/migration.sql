-- Un seul avis par utilisateur par entité (permet un upsert applicatif sûr).
CREATE UNIQUE INDEX "reviews_user_id_entity_type_entity_id_key" ON "reviews"("user_id", "entity_type", "entity_id");
