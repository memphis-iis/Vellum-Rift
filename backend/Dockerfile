# syntax=docker/dockerfile:1
# Vellum Rift backend — production image.
# Build:  docker build -t vellumrift-backend ./backend
# Run:    docker run --network traefik_proxy -e DATABASE_URL=... -p 4000:4000 vellumrift-backend
#         (see infra/deploy/iis-memphis/README.md for the full deploy)

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci on this host intermittently extracts the large typescript tarball as
# empty, leaving node_modules/.bin/tsc missing. Verify and retry with a clean
# cache; if the retry also fails the build stops with a clear error.
RUN npm ci --no-audit --no-fund \
    && (test -x node_modules/.bin/tsc || (npm cache clean --force && npm ci --no-audit --no-fund)) \
    && test -x node_modules/.bin/tsc
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=dev \
    && (npm ls --depth=0 >/dev/null 2>&1 || (npm cache clean --force && npm ci --no-audit --no-fund --omit=dev)) \
    && npm ls --depth=0 >/dev/null
# Compiled JS/TS output.
COPY --from=build /app/dist ./dist
# Startup ingestion reads src/sample/pdfs (referenced relative to the compiled
# module: dist/lib -> ../sample/pdfs). tsc does not copy non-TS assets.
COPY --from=build /app/src/sample ./dist/sample
EXPOSE 4000
CMD ["node", "dist/index.js"]
