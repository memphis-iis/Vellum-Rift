# ---------------------------------------------------------------------------
# Stage 1: Install & build (pnpm monorepo)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable

# Copy lockfile + all workspace package.json files first (layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY webrtc-sfu/package.json ./webrtc-sfu/
COPY web-dashboard/package.json ./web-dashboard/
COPY launcher/package.json ./launcher/

# Filter install so backend-only native deps (canvas) are not built here
RUN pnpm install --frozen-lockfile --filter=@vellum-rift/webrtc-sfu...

COPY . .
RUN pnpm --filter @vellum-rift/webrtc-sfu build

# ---------------------------------------------------------------------------
# Stage 2: Runtime (minimal)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/webrtc-sfu/node_modules ./webrtc-sfu/node_modules
COPY --from=builder /app/webrtc-sfu/package.json ./webrtc-sfu/package.json
COPY --from=builder /app/webrtc-sfu/dist ./webrtc-sfu/dist

WORKDIR /app/webrtc-sfu

EXPOSE 4100

ARG VERSION
ARG COMMIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

CMD ["node", "dist/index.js"]
