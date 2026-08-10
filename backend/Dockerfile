# ---------------------------------------------------------------------------
# Stage 1: Install & build (pnpm monorepo)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy lockfile + all workspace package.json files first (layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY webrtc-sfu/package.json ./webrtc-sfu/
COPY web-dashboard/package.json ./web-dashboard/
COPY launcher/package.json ./launcher/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build the backend package
COPY . .
RUN pnpm --filter @vellum-rift/backend build

# ---------------------------------------------------------------------------
# Stage 2: Runtime (minimal)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production artifacts from builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json

# Copy shared node_modules (only what the backend needs at runtime)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules

EXPOSE 4000

ARG VERSION
ARG COMMIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

CMD ["node", "dist/index.js"]
