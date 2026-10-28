# Deploy: Offline LAN party (no internet)

Private-router profile for a **server + laptops + Quest headsets** with **no WAN**.
Do **not** apply this env or compose on the Memphis / IIS host.

For production/test on `iis.memphis.edu`, see [../iis-memphis/README.md](../iis-memphis/README.md).

Full ops checklist: [docs/qa/lan-party-runbook.md](../../../docs/qa/lan-party-runbook.md). Elementary/middle **classroom museum** visits: [docs/qa/classroom-museum-runbook.md](../../../docs/qa/classroom-museum-runbook.md). **USB kit (dynamic IP + discovery):** [../museum-kit/README.md](../museum-kit/README.md), [docs/qa/museum-kit-runbook.md](../../../docs/qa/museum-kit-runbook.md). Optional Quest beacon overlay: `docker compose -f docker-compose.yml -f docker-compose.discover.yml up -d`.

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

## Fake DNS sinkhole (Quest Wi‑Fi on air‑gap)

Compose runs **dnsmasq** (`dockurr/dnsmasq` + `dnsmasq.conf.template`): every query returns `SERVER_LAN_IP`. Point the LAN router’s DHCP DNS at the party server so headsets do not treat the network as “no internet” and drop Wi‑Fi.

**Start with live host IP** (bind `:53` and sinkhole `address=/#/` to the same address — avoids stale `.env` when the laptop/router IP changes):

```bash
./start-with-dns.sh          # dnsmasq only; writes .env.runtime
./start-with-dns.sh --all    # full stack + runtime IP for dnsmasq
```

Detection uses the default-route IPv4 (`ip -4 route get 1.1.1.1`), skipping docker/loopback; **tailscale0** is used only if no other global IPv4 exists.

**Verify on the server** (after `./start-with-dns.sh` or `docker compose up -d dnsmasq web-dashboard`):

```bash
dig @${SERVER_LAN_IP} clients3.google.com +short   # → SERVER_LAN_IP
curl -s -o /dev/null -w '%{http_code}\n' "http://${SERVER_LAN_IP}/generate_204"   # → 204
```

DNS publishes on **`${SERVER_LAN_IP}:53`** (not `0.0.0.0:53`) so it does not conflict with **systemd-resolved** on Linux dev boxes (resolved usually listens on `127.0.0.53` / `127.0.0.54` only). If you need `53` on all interfaces on a dedicated party host, change `dnsmasq` `ports` in `docker-compose.yml` to `"53:53/udp"` and `"53:53/tcp"` and stop anything else bound to :53.

On **Fedora Workstation** with **firewalld**, allow DNS during local tests: `sudo firewall-cmd --add-port=53/udp --add-port=53/tcp` (or add a rich rule for `${SERVER_LAN_IP}`). Default zone often permits high ports only, so `dig @${SERVER_LAN_IP}` can time out until :53 is open.

The dashboard container serves **`DASHBOARD_HTTP_PORT` (default 80)** as well as `DASHBOARD_PORT` (5173) so HTTP probes to the sinkholed IP on port 80 succeed (`nginx-dashboard.conf`).

### OpenWrt (James)

On the private router, set the party server as the LAN DNS forwarder (example `192.168.1.184` — use your `SERVER_LAN_IP`):

1. **Network → DHCP and DNS → General Settings** → **DNS forwardings**: `192.168.1.184` (or `SERVER_LAN_IP`).
2. **Network → Interfaces → LAN → DHCP Server → Advanced** → **DHCP-Options**: `6,192.168.1.184` (`6,<SERVER_LAN_IP>` — option 6 = DNS servers for clients).

Renew DHCP on Quests (toggle Wi‑Fi) after changing options.
