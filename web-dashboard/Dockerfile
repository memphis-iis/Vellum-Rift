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

# Copy source and build the web-dashboard package
COPY . .
RUN pnpm --filter @vellum-rift/web-dashboard build

# ---------------------------------------------------------------------------
# Stage 2: Serve static files with nginx (minimal)
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Copy built dashboard assets from builder
COPY --from=builder /app/web-dashboard/dist .

# Custom nginx config to handle SPA routing
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
