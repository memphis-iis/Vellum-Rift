# Deploy: Offline LAN party (no internet)

Private-router profile for a **server + laptops + Quest headsets** with **no WAN**.
Do **not** apply this env or compose on the Memphis / IIS host.

For production/test on `iis.memphis.edu`, see [../iis-memphis/README.md](../iis-memphis/README.md).

Full ops checklist: [docs/qa/lan-party-runbook.md](../../../docs/qa/lan-party-runbook.md).

## What this is

- Postgres + MinIO + backend on one LAN machine
- `AUTH_REQUIRED` unset/false (no Bluekey IdP)
- Kiosk JWT secret set so museum/guest join still works
- `CHAT_ENABLED=false` / `VITE_CHAT_ENABLED=false` in the example (IIS leaves these unset)
- **No WebRTC SFU** — Unity multiplayer uses HTTP game-state polling

## What this is not

- A replacement for IIS Memphis Caddy / Bluekey / GHCR auto-deploy
- A requirement to change SampleScene baked `iis.memphis.edu` defaults

## Quick start

1. Copy env and set the server LAN IP everywhere clients will call:

   ```bash
   cd infra/deploy/lan-party
   cp .env.example .env
   # edit SERVER_LAN_IP, DASHBOARD_PUBLIC_URL, S3_ENDPOINT, secrets
   ```

2. Bring up the stack:

   ```bash
   docker compose up -d
   curl http://<SERVER_LAN_IP>:4000/api/health
   ```

3. Build/serve the dashboard and WebGL with LAN Vite vars from `.env.example`
   (`VITE_API_BASE_URL`, `VITE_WEBGL_BASE_URL`, `VITE_CHAT_ENABLED=false`).

4. Point Quest/standalone at the LAN API (`VELLUM_BACKEND_HOST` / `-backendHost`).
   Quest/WebGL museum builds: optional `VELLUM_BUILD_BACKEND_URL` and `VELLUM_BUILD_ALLOW_INSECURE_HTTP` (see `vr-client-unity/scripts/build-*.sh`, #295).

### Without the backend container

Use root `make infra-up` for Postgres/MinIO and run `npm run dev` in `backend/`
with the same chat/kiosk env vars (use `localhost` for `DATABASE_URL` / `S3_ENDPOINT`
on the server process; clients still use the LAN IP for the API).

## Image override

```bash
BACKEND_IMAGE=ghcr.io/<org>/vellum-rift/backend:<tag> docker compose up -d
```
