# syntax=docker/dockerfile:1
# ─── Stage 1 : build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.1.0

# Copy workspace manifests first (layer-cached until deps change)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json    ./packages/config/
COPY packages/types/package.json     ./packages/types/
COPY packages/utils/package.json     ./packages/utils/
COPY packages/database/package.json  ./packages/database/
COPY apps/api/package.json           ./apps/api/

RUN pnpm install --frozen-lockfile

# Copy source after installing deps
COPY packages/config   ./packages/config
COPY packages/types    ./packages/types
COPY packages/utils    ./packages/utils
COPY packages/database ./packages/database
COPY apps/api          ./apps/api
COPY turbo.json        ./

# Generate Prisma client (Alpine/build-time — will regenerate in runner for correct platform)
RUN pnpm --filter @vivre/database run generate

# Build packages in dependency order
RUN pnpm --filter @vivre/types    run build
RUN pnpm --filter @vivre/utils    run build
RUN pnpm --filter @vivre/database run build
RUN pnpm --filter @vivre/api      run build

# Standalone production bundle
RUN pnpm deploy --filter @vivre/api --prod /prod/api

# Copy schema into the bundle so prisma generate works in the runner stage
RUN cp -r /app/packages/database/prisma /prod/api/prisma

# ─── Stage 2 : image de production ───────────────────────────────────────────
# node:20-slim = Debian Bookworm + glibc — required for Prisma query engine
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g prisma@5

COPY --from=builder /prod/api ./

# Regenerate Prisma client HERE on the correct OS (Debian OpenSSL 3.0.x).
# This ensures the right query engine binary is used at runtime.
RUN prisma generate --schema=./prisma/schema.prisma

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 fastify --ingroup nodejs && \
    chown -R fastify:nodejs /app

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER fastify
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
