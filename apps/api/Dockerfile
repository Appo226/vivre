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

# Generate Prisma client
RUN pnpm --filter @vivre/database run generate

# Build packages in dependency order
RUN pnpm --filter @vivre/types    run build
RUN pnpm --filter @vivre/utils    run build
RUN pnpm --filter @vivre/database run build
RUN pnpm --filter @vivre/api      run build

# Standalone production bundle (includes flattened node_modules)
RUN pnpm deploy --filter @vivre/api --prod /prod/api

# pnpm deploy installs packages from lockfile but does NOT copy generated
# .prisma/client/ artifacts — regenerate them inside the production bundle.
RUN cp -r /app/packages/database/prisma /prod/api/prisma && \
    cd /prod/api && \
    /app/node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# ─── Stage 2 : image de production ───────────────────────────────────────────
# Use debian-slim instead of alpine: Prisma engines require glibc/openssl
FROM node:20-slim AS runner
WORKDIR /app

# openssl + prisma CLI — must be installed before user switch
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g prisma@5 && \
    # Allow non-root user to write prisma engine cache
    chmod -R a+w /usr/local/lib/node_modules/prisma/

COPY --from=builder /prod/api ./
# /prod/api/prisma/ is already included above (copied there before prisma generate)

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 fastify --ingroup nodejs && \
    chown -R fastify:nodejs /app

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER fastify
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
