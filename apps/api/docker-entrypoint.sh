#!/bin/sh
set -e

echo "[VIVRE API] Applying database migrations..."
prisma migrate deploy

echo "[VIVRE API] Starting server..."
exec "$@"
