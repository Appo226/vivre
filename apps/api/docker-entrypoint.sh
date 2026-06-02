#!/bin/sh
set -e

# Migrations are handled by Render's preDeployCommand.
# Run them here as a fallback (local Docker, first deploy, etc.)
echo "[VIVRE API] Applying database migrations..."
prisma migrate deploy

echo "[VIVRE API] Starting server..."
exec "$@"
