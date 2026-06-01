# syntax=docker/dockerfile:1
# ─── Stage 1 : build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.1.0

# Copy workspace manifests first (layer-cached until deps change)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json  ./packages/config/
COPY packages/types/package.json   ./packages/types/
COPY packages/utils/package.json   ./packages/utils/
COPY packages/ui/package.json      ./packages/ui/
COPY apps/web/package.json         ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source after installing deps
COPY packages/config ./packages/config
COPY packages/types  ./packages/types
COPY packages/utils  ./packages/utils
COPY packages/ui     ./packages/ui
COPY apps/web        ./apps/web
COPY turbo.json      ./

# Build-time env vars injected by CI
ARG NEXT_PUBLIC_API_URL=https://api.vivre.bf
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY=""

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN pnpm run build

# ─── Stage 2 : image de production ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public           ./apps/web/public

USER nextjs
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
