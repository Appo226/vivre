# syntax=docker/dockerfile:1
# ─── Stage 1 : installation des dépendances ───────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN npm install -g pnpm@9.1.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json    ./packages/config/
COPY packages/types/package.json     ./packages/types/
COPY packages/utils/package.json     ./packages/utils/
COPY packages/database/package.json  ./packages/database/
COPY apps/api/package.json           ./apps/api/

RUN pnpm install --frozen-lockfile

# ─── Stage 2 : compilation ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.1.0

COPY --from=deps /app/node_modules        ./node_modules
COPY --from=deps /app/packages            ./packages

COPY packages/config   ./packages/config
COPY packages/types    ./packages/types
COPY packages/utils    ./packages/utils
COPY packages/database ./packages/database
COPY apps/api          ./apps/api
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./

# Génère le client Prisma dans node_modules
RUN pnpm --filter @vivre/database run generate

# Compile les packages dans l'ordre de dépendance
RUN pnpm --filter @vivre/types    run build
RUN pnpm --filter @vivre/utils    run build
RUN pnpm --filter @vivre/database run build
RUN pnpm --filter @vivre/api      run build

# Bundle de déploiement autonome (inclut node_modules aplatis + fichiers compilés)
RUN pnpm deploy --filter @vivre/api --prod /prod/api

# ─── Stage 3 : image de production ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Prisma CLI pour les migrations au démarrage
RUN npm install -g prisma@5

COPY --from=builder /prod/api          ./
COPY --from=builder /app/packages/database/prisma ./prisma

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 fastify && \
    chown -R fastify:nodejs /app

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER fastify
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
