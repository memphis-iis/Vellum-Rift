# Deploy: Vellum Rift test platform on iis.memphis.edu

Public endpoints:

- API:      `https://iis.memphis.edu/apis/vellumrift/` (backend container, port 4000)
- WebGL:    `https://iis.memphis.edu/vellumrift/` (static files)

## Topology

```
Browser (WebGL at /vellumrift/)
   └─▶ Caddy (:443, container on traefik_proxy)
         ├─ /apis/vellumrift/*  ─▶ vellumrift-backend:4000 (Node 20 container)
         └─ /vellumrift/*       ─▶ /assets/static/vellumrift/ (host bind mount)
vellumrift-backend ─▶ hasura-postgres:5432 (shared Postgres 15, db `vellum_rift`)
```

Notes:
- `/vellumrift/` and `/apis/vellumrift/` share the same origin
  (`iis.memphis.edu`, port 443), so the WebGL client needs **no CORS** setup.
- No host ports are published for the backend — Caddy proxies container to
  container over the docker network.

## One-time setup (already applied 2026-08-06; re-run to redeploy)

1. Build the image from the repo (the box has the code at `/opt/vellumrift`):

   ```bash
   cd /opt/vellumrift/backend && docker build -t vellumrift-backend:latest .
   ```

2. Configure the database role/db inside the shared hasura-postgres
   (idempotent; run as the hasura superuser):

   ```bash
   docker exec hasura-postgres psql -U hasura -d hasura -c \
     "CREATE ROLE vellumrift LOGIN PASSWORD '<pw>';"
   docker exec hasura-postgres psql -U hasura -d hasura -c \
     "CREATE DATABASE vellum_rift OWNER vellumrift;"
   ```

3. Configure the backend env and start the container:

   ```bash
   cd /opt/vellumrift/infra/deploy/iis-memphis
   cp .env.example .env   # set the real vellumrift password
   docker compose up -d
   ```

   The backend runs `initSchema()` on startup, which creates its tables in
   `vellum_rift` automatically — no manual migration needed.

4. Add the routes to Caddy (see `Caddyfile.vellumrift.snippet`): insert the two
   `handle_path` blocks into the `iis.memphis.edu { }` block of
   `/assets/Caddyfile`, then reload (zero downtime, validate first):

   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

5. Place the Unity WebGL build in `/assets/static/vellumrift/` so it is served
   at `https://iis.memphis.edu/vellumrift/`. `index.html` is the entry point.

## Verify

```bash
curl -sk https://iis.memphis.edu/apis/vellumrift/api/health
# {"status":"ok","service":"backend","environment":"production","gameState":{...}}
curl -sk -o /dev/null -w '%{http_code}\n' https://iis.memphis.edu/vellumrift/
# 200
```

Regression check that existing apps still route (should all stay 200/301):

```bash
for p in / /static/cohmetrix/ /apis/bluekey/ /apis/cis/ /tracker; do
  curl -sk -o /dev/null -w "%{http_code} $p\n" "https://iis.memphis.edu$p"
done
```

## Client configuration for the WebGL build

The WebGL client must point at the API base URL. Same-origin relative paths are
preferred; otherwise pass `?backendUrl=https://iis.memphis.edu/apis/vellumrift`
(the WebGL build reads it — see the WebGL URL config fix PR).

## Rollback

- Caddy: remove the two `handle_path` blocks and `caddy reload`.
- Backend: `docker compose -f infra/deploy/iis-memphis/docker-compose.yml down`.
- Nothing in this deploy modifies existing containers, volumes, or Caddy blocks.
