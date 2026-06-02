#!/bin/sh
set -e

# On Render, migrations run in preDeployCommand before this starts.
# In local Docker / other envs, run them here as a fallback.
if [ "${RENDER}" != "true" ]; then
  echo "[VIVRE API] Applying database migrations..."
  prisma migrate deploy
fi

echo "[VIVRE API] Starting server..."
exec "$@"
