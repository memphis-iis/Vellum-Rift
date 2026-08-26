# ---------------------------------------------------------------------------
# Stage 1: Install & build (pnpm monorepo)
# ---------------------------------------------------------------------------
# bookworm-slim (glibc) so canvas/sharp can use prebuilds instead of node-gyp.
# Alpine has no canvas prebuild and fails without Python/build tooling.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

# Copy lockfile + all workspace package.json files first (layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY webrtc-sfu/package.json ./webrtc-sfu/
COPY web-dashboard/package.json ./web-dashboard/
COPY launcher/package.json ./launcher/

# Install backend workspace tree only (avoids pulling unrelated packages)
RUN pnpm install --frozen-lockfile --filter=@vellum-rift/backend...

# Copy source and build the backend package
COPY . .
RUN pnpm --filter @vellum-rift/backend build

# ---------------------------------------------------------------------------
# Stage 2: Runtime (minimal)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Runtime shared libs required by node-canvas prebuilds
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

# Production node_modules for the backend filter tree
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/dist ./backend/dist
# Sample assets referenced at runtime by SampleModelIngestor
COPY --from=builder /app/backend/src/sample ./backend/dist/sample

WORKDIR /app/backend

EXPOSE 4000

ARG VERSION
ARG COMMIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

CMD ["node", "dist/index.js"]
