# Deploy: Offline LAN party (no internet)

Private-router profile for a **server + laptops + Quest headsets** with **no WAN**.
Do **not** apply this env or compose on the Memphis / IIS host.

For production/test on `iis.memphis.edu`, see [../iis-memphis/README.md](../iis-memphis/README.md).

Full ops checklist: [docs/qa/lan-party-runbook.md](../../../docs/qa/lan-party-runbook.md).

## What this is

- Postgres + **Silo** (`pgsty/silo`, MinIO-compatible S3) + backend + **dashboard** + **WebGL** on one LAN machine
- `AUTH_REQUIRED` unset/false (no Bluekey IdP)
- Kiosk JWT secret set so museum/guest join still works
- `CHAT_ENABLED=false` / `VITE_CHAT_ENABLED=false` in the example (IIS leaves these unset)
- **No WebRTC SFU** — Unity multiplayer uses HTTP game-state polling

## What this is not

- A replacement for IIS Memphis Caddy / Bluekey / GHCR auto-deploy
- A requirement to change SampleScene baked `iis.memphis.edu` defaults
- Automatic Unity WebGL or Quest APK builds (prepare artifacts while online)

## Quick start (museum / air-gap server)

1. Copy env and set the server LAN IP everywhere clients will call:

   ```bash
   cd infra/deploy/lan-party
   cp .env.example .env
   # edit SERVER_LAN_IP, DASHBOARD_PUBLIC_URL, VITE_* URLs, S3_ENDPOINT, secrets
   ```

2. Place a **Unity WebGL museum build** on disk (while Unity/internet are available):

   ```bash
   # From repo root, after vr-client-unity/scripts/build-webgl-museum.sh
   rsync -a --delete "vr-client-unity/Vellum Rift/web build/" infra/deploy/lan-party/webgl/
   ```

   Or set `WEBGL_DIST` in `.env` to another directory. Compose serves it on `WEBGL_PORT` (default **8080**) with Unity-friendly `Content-Encoding` headers for `.br`/`.gz` artifacts.

3. Bring up the full stack (builds the dashboard image with `VITE_*` from `.env`):

   ```bash
   docker compose up -d
   curl "http://<SERVER_LAN_IP>:4000/api/health"
   curl -I "http://<SERVER_LAN_IP>:5173/"
   curl -I "http://<SERVER_LAN_IP>:8080/"
   ```

4. Open `DASHBOARD_PUBLIC_URL` on the host laptop; guests use kiosk QR / WebGL at `VITE_WEBGL_BASE_URL`.

5. **Quest:** install the LAN-built APK separately (`vr-client-unity/scripts/build-android-quest.sh`, #295). Kiosk **Space** setup is still on the host dashboard.

### Dashboard without compose build

Prefer compose (above). Alternatives:

- **Prebuilt image:** set `DASHBOARD_IMAGE` to a tag you built with the same `VITE_*` args as `Dockerfile.dashboard`.
- **Mounted dist:** run any static server over `web-dashboard/dist` built locally with the same Vite vars (see runbook §2.4).

### Without the backend container

Use root `make infra-up` for Postgres/Silo and run `npm run dev` in `backend/`
with the same chat/kiosk env vars (use `localhost` for `DATABASE_URL` / `S3_ENDPOINT`
on the server process; clients still use the LAN IP for the API). Dashboard/WebGL
compose services can still be used, or serve static assets manually.

## Object storage (Silo)

Compose runs **[Silo](https://github.com/pgsty/silo)** (`pgsty/silo`) instead of Docker Hub `minio/minio`. Silo is a maintained MinIO fork with the same S3 API, `MINIO_*` credentials, and on-disk layout — existing `lan_minio_data` volumes keep working after an image swap. Bucket bootstrap uses `pgsty/mc` (MinIO Client).

## Image override

```bash
BACKEND_IMAGE=ghcr.io/<org>/vellum-rift/backend:<tag> docker compose up -d
```

Dashboard rebuild after `.env` Vite changes: `docker compose build web-dashboard && docker compose up -d web-dashboard`.
