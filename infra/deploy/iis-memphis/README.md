# Deploy: Vellum Rift test platform on iis.memphis.edu

Public endpoints (LIVE since 2026-08-06):

- API:      `https://iis.memphis.edu/apis/vellumrift/` (backend container, port 4000)
- WebGL:    `https://iis.memphis.edu/vellumrift/` (static files)

## Topology

```
Browser (WebGL at /vellumrift/)
   └─▶ Caddy (:443, container on traefik_proxy)
         ├─ /apis/vellumrift/*  ─▶ vellumrift-backend:4000 (node:20 container)
         └─ /vellumrift/*       ─▶ /assets/static/vellumrift/ (host bind mount)
vellumrift-backend ─▶ hasura-postgres:5432 (shared Postgres 15, db `vellum_rift`)
```

Notes:
- `/vellumrift/` and `/apis/vellumrift/` share the same origin
  (`iis.memphis.edu`, port 443), so the WebGL client needs **no CORS** setup.
- No host ports are published for the backend — Caddy proxies container to
  container over the docker network.

## Deployment model

This box's docker/npm **cannot run `npm ci` reliably** (intermittently extracts
large packages as empty dirs). So the backend is NOT built on the box:

1. On a healthy host (this repo): `pnpm install --frozen-lockfile` (workspace),
   `pnpm --filter @vellum-rift/backend build`, then
   `pnpm --filter @vellum-rift/backend deploy --prod <dir>` to produce a
   standalone production artifact (real files + prod deps).
2. Transfer the artifact to the box **preserving symlinks** — the pnpm layout
   uses symlinks into `.pnpm/`; dereferencing them (`tar -h` / `rsync -L`)
   breaks module resolution (ERR_MODULE_NOT_FOUND). Use plain
   `tar czf` / `rsync -a`:
   ```bash
   tar czf - -C <dir> . | ssh jrhaner@iis "tar xzf - -C ~/vellumrift/backend"
   ```
3. Run from the volume mount (no npm on the box):
   ```bash
   cd ~/vellumrift/infra/deploy/iis-memphis
   docker compose up -d
   ```

`backend/Dockerfile` exists for other hosts; on this box it is not used.

## One-time setup (applied 2026-08-06)

1. Database role/db inside the shared hasura-postgres (idempotent):
   ```bash
   docker exec hasura-postgres psql -U hasura -d hasura -c \
     "CREATE ROLE vellumrift LOGIN PASSWORD '<pw>';"
   docker exec hasura-postgres psql -U hasura -d hasura -c \
     "CREATE DATABASE vellum_rift OWNER vellumrift;"
   ```
2. Backend env: `~/vellumrift/infra/deploy/iis-memphis/.env` (copy from
   `.env.example`, set the real password). Backend runs `initSchema()` on
   startup — tables are created automatically.
3. Caddy routes (see `Caddyfile.vellumrift.snippet`): inserted into the
   `iis.memphis.edu { }` block of `/assets/Caddyfile` before the WordPress
   catch-all, then:
   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```
4. WebGL build → `/assets/static/vellumrift/` (served at
   `https://iis.memphis.edu/vellumrift/`; `index.html` is the entry).

## Verify

```bash
curl -sk https://iis.memphis.edu/apis/vellumrift/api/health
# {"status":"ok","service":"backend","environment":"production","gameState":{...}}
curl -sk -o /dev/null -w '%{http_code}\n' https://iis.memphis.edu/vellumrift/   # 200
```

Regression check (existing apps must stay up):
```bash
for p in / /static/cohmetrix/ /tracker /data-old/v1/graphql; do
  curl -sk -o /dev/null -w "%{http_code} $p\n" "https://iis.memphis.edu$p"
done
```

## Client configuration for the WebGL build

The WebGL client must point at the API base URL
(`https://iis.memphis.edu/apis/vellumrift`). The demo client reads it from a
`?backendUrl=` query param or a baked default (see the WebGL URL config PR).

## Rollback

- Caddy: remove the two `handle_path` blocks and `caddy reload` (backup:
  `/assets/Caddyfile.bak-20260806-114150`).
- Backend: `docker compose -f infra/deploy/iis-memphis/docker-compose.yml down`.
- Nothing in this deploy modifies existing containers, volumes, or Caddy blocks.
