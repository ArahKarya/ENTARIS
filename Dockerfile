# ============================================================================
# Entaris — Multi-stage Dockerfile
# Builds both client (React/Vite) and server (Express/TypeScript) into a
# single production image. Express serves the API and the static SPA.
# ============================================================================

# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Upgrade npm to avoid the npm@10.8.2 "Exit handler never called" bug on ARM
RUN npm install -g npm@11

# Client deps (serialized to reduce peak memory on low-RAM hosts)
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci --legacy-peer-deps --no-audit --no-fund --maxsockets=1 --prefer-offline \
    && test -x node_modules/.bin/tsc

# Server deps
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --no-audit --no-fund --maxsockets=1

# ── Stage 2: Build client + server ──────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY client/ ./client/
COPY server/ ./server/
# Katalog tool AIRA (dokumen_tool di MCP) — disalin ke dist/ai oleh `npm run build`.
COPY docs/ai-tools/catalog.json ./docs/ai-tools/catalog.json

# Build client (React + Vite → client/dist/)
RUN cd client && npm run build

# Generate Prisma client + build server (TypeScript → server/dist/)
RUN cd server && npx prisma generate && npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Jakarta

# Install pg_dump/psql (for backup/restore), gzip, vips (for sharp image processing)
# and tzdata (so TZ resolves to the business timezone, not UTC)
RUN apk add --no-cache postgresql16-client gzip vips tzdata

# Install only production deps (prisma, tsx, sharp, multer all in dependencies)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Create uploads + backups directories
RUN mkdir -p /app/uploads/attachments /app/server/backups

# Copy build artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=builder /app/server/node_modules/@prisma/client ./server/node_modules/@prisma/client
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/prisma.config.ts ./server/prisma.config.ts
COPY --from=builder /app/client/dist ./client/dist

# Entrypoint: migrate + auto-seed + start
COPY docker-app-entrypoint.sh /docker-app-entrypoint.sh
RUN chmod +x /docker-app-entrypoint.sh

# Run as non-root: ensure writable dirs are owned by the node user (uid 1000)
RUN chown -R node:node /app/uploads /app/server/backups
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

EXPOSE 3001
WORKDIR /app/server

CMD ["/docker-app-entrypoint.sh"]
