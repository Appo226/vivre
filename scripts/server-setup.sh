#!/usr/bin/env bash
# scripts/server-setup.sh — Bootstrap du VPS VIVRE (à exécuter une seule fois)
# Usage : bash <(curl -fsSL https://raw.githubusercontent.com/Appo226/vivre/main/scripts/server-setup.sh)
# Ou : scp + ssh root@VPS "bash /tmp/server-setup.sh"

set -euo pipefail

echo "=== VIVRE VPS Bootstrap ==="
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
echo ""

# ─── 1. Mise à jour système ────────────────────────────────────────────────────
echo "1/6 — Mise à jour des paquets..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── 2. Docker Engine + Docker Compose v2 ─────────────────────────────────────
echo "2/6 — Installation de Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "    Docker déjà installé : $(docker --version)"
fi

# ─── 3. Répertoire de déploiement ─────────────────────────────────────────────
echo "3/6 — Création de /opt/vivre..."
mkdir -p /opt/vivre/nginx
mkdir -p /opt/vivre/docker/postgres

# ─── 4. Fichier d'environnement de production ─────────────────────────────────
echo "4/6 — Création de .env.production..."
if [ ! -f /opt/vivre/.env.production ]; then
  cat > /opt/vivre/.env.production <<'ENVEOF'
# ─── PostgreSQL ───────────────────────────────────────────────────────────────
POSTGRES_USER=vivre_user
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=vivre_prod

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=CHANGE_ME_STRONG_REDIS_PASSWORD

# ─── JWT (générer : openssl rand -hex 64) ────────────────────────────────────
JWT_SECRET=CHANGE_ME_64_HEX_CHARS
JWT_REFRESH_SECRET=CHANGE_ME_64_HEX_CHARS_DIFFERENT

# ─── URLs publiques ───────────────────────────────────────────────────────────
API_URL=http://144.24.145.12/v1
WEB_URL=http://144.24.145.12

# ─── Docker images ────────────────────────────────────────────────────────────
GITHUB_REPOSITORY_OWNER=Appo226
IMAGE_TAG=latest

# ─── CinetPay ────────────────────────────────────────────────────────────────
CINETPAY_API_KEY=CHANGE_ME
CINETPAY_SITE_ID=CHANGE_ME

# ─── Twilio SMS ──────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=CHANGE_ME
TWILIO_AUTH_TOKEN=CHANGE_ME
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# ─── Anthropic AI ────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-CHANGE_ME

# ─── Firebase Admin (base64 du service account JSON) ─────────────────────────
FIREBASE_SERVICE_ACCOUNT_JSON=CHANGE_ME_BASE64_ENCODED_SERVICE_ACCOUNT_JSON
ENVEOF
  echo "    /opt/vivre/.env.production créé — à remplir avant le déploiement !"
else
  echo "    .env.production déjà présent — conservé."
fi

# ─── 5. Sécurité SSH ──────────────────────────────────────────────────────────
echo "5/6 — Configuration SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd 2>/dev/null || true

# ─── 6. Firewall ufw ──────────────────────────────────────────────────────────
echo "6/6 — Configuration du firewall..."
if command -v ufw &>/dev/null; then
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp   comment "SSH"
  ufw allow 80/tcp   comment "HTTP"
  ufw allow 443/tcp  comment "HTTPS"
  ufw --force enable
  echo "    ufw activé : 22 + 80 + 443"
else
  echo "    ufw non disponible — configurer le firewall manuellement (ports 22, 80, 443)"
fi

echo ""
echo "✓ Bootstrap terminé !"
echo ""
echo "Prochaines étapes :"
echo "  1. Renseigner /opt/vivre/.env.production (JWT, CinetPay, Twilio, Anthropic)"
echo "  2. Déclencher le déploiement GitHub Actions (push sur main)"
echo "  3. Optionnel : configurer SSL Let's Encrypt une fois le DNS pointé"
