#!/usr/bin/env bash
# scripts/deploy.sh — Déploiement manuel sur VPS
# Usage : ./scripts/deploy.sh [IMAGE_TAG]
#
# Pré-requis VPS :
#   - Docker + Docker Compose v2
#   - /opt/vivre/.env.production renseigné (voir .env.production.example)
#   - SSL : docker compose run certbot certonly --webroot -w /var/www/certbot -d vivre.bf -d www.vivre.bf -d api.vivre.bf

set -euo pipefail

DEPLOY_DIR="/opt/vivre"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"
IMAGE_TAG="${1:-latest}"
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-Appo226}"

echo "=== VIVRE Deployment ==="
echo "Tag: $IMAGE_TAG"
echo "Dir: $DEPLOY_DIR"
echo ""

# Vérifications préalables
[ -f "$COMPOSE_FILE" ]       || { echo "ERROR: docker-compose.prod.yml introuvable dans $DEPLOY_DIR"; exit 1; }
[ -f "$DEPLOY_DIR/.env.production" ] || { echo "ERROR: .env.production introuvable dans $DEPLOY_DIR"; exit 1; }

cd "$DEPLOY_DIR"

# Charger les variables d'environnement
set -a
source .env.production
set +a

export IMAGE_TAG
export GITHUB_REPOSITORY_OWNER

echo "1/4 — Téléchargement des images..."
docker compose -f "$COMPOSE_FILE" pull api web

echo "2/4 — Redémarrage des services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "3/4 — Vérification de la santé des services..."
sleep 10
docker compose -f "$COMPOSE_FILE" ps

echo "4/4 — Nettoyage des images orphelines..."
docker image prune -f

echo ""
echo "✓ Déploiement terminé — $IMAGE_TAG"
echo "  Web : https://vivre.bf"
echo "  API : https://api.vivre.bf"
