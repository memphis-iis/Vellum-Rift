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
RUN pnpm install --frozen-lockfile --filter=@vellum-rift/web-dashboard...

COPY . .
RUN pnpm --filter @vellum-rift/web-dashboard build

# ---------------------------------------------------------------------------
# Stage 2: Serve static files with nginx (minimal)
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/web-dashboard/dist .

RUN rm /etc/nginx/conf.d/default.conf && cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80

ARG VERSION
ARG COMMIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

CMD ["nginx", "-g", "daemon off;"]
