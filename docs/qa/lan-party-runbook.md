# Offline LAN party — QA runbook

Epic: https://github.com/memphis-iis/Vellum-Rift/issues/291  
Issue: https://github.com/memphis-iis/Vellum-Rift/issues/296

Run a **private-router** Vellum Rift night: one LAN server, laptops, and Quest headsets with **no WAN** after prep. Multiplayer uses **HTTP game-state polling** (Demo 1 path), not WebRTC SFU.

Deploy profile: [infra/deploy/lan-party/README.md](../../infra/deploy/lan-party/README.md).

Related QA:

- [museum-guest-entry.md](museum-guest-entry.md) — kiosk QR, guest join, observer wall display
- [multiplayer-demo-runbook.md](multiplayer-demo-runbook.md) — session polling architecture and client backend URL resolution
- **Classroom museum (elementary/middle, Quest + laptops):** [classroom-museum-runbook.md](classroom-museum-runbook.md), [classroom-museum-presenter-script.md](classroom-museum-presenter-script.md)

## 1. Topology and ports

```
                    ┌─────────────────────────────────────┐
  Laptops / Quest   │  LAN server (SERVER_LAN_IP)         │
  (Wi‑Fi, no WAN)   │  ┌─────────┐  ┌──────┐  ┌───────┐ │
        │           │  │ backend │  │ MinIO│  │Postgres│ │
        └─HTTP──────┼─▶│  :4000  │  │:9000 │  │ :5432 │ │
                    │  └────┬────┘  └──▲───┘  └───▲───┘ │
                    │       │          │          │     │
                    │  Dashboard (static or Vite) :5173   │
                    │  WebGL static host              :8080 │
                    └─────────────────────────────────────┘
```

| Service | Port | Who uses it |
|---------|------|-------------|
| Backend API | **4000** | Dashboard, WebGL, Quest APK (health, sessions, game state, kiosk, help requests) |
| MinIO S3 API | **9000** | Backend (asset storage); console **9001** optional for ops |
| Postgres | **5432** | Backend only (compose network or localhost on server) |
| Dashboard | **5173** (typical) | Host + guests in browser (`DASHBOARD_PUBLIC_URL`) |
| WebGL build | **8080** (typical) | Embedded 3D (`VITE_WEBGL_BASE_URL`) |

**Air-gap expectations**

- After prep, the party router has **no internet**. Bluekey IdP, GHCR pulls, Memphis Caddy, and SFU signaling are **out of scope** for this profile.
- `AUTH_REQUIRED` is **unset/false** on the backend; hosts use **Continue as local developer** on the dashboard (see §4).
- Guests join via **kiosk** URLs / Quest event list — no IIS account (see [museum-guest-entry.md](museum-guest-entry.md)).
- Do **not** deploy `infra/deploy/lan-party` on the Memphis / IIS host.

## 2. Prep (while internet is available)

Do this on a machine that can reach GitHub, GHCR (if using prebuilt backend image), Docker Hub (`pgsty/silo`, `pgsty/mc`), and any manuscript sources.

### 2.1 Clone and profile env

```bash
git clone https://github.com/memphis-iis/Vellum-Rift.git
cd Vellum-Rift/infra/deploy/lan-party
cp .env.example .env
```

Edit `.env`:

- Set `SERVER_LAN_IP` to the address laptops and Quests will use on party night.
- Mirror that IP in `DASHBOARD_PUBLIC_URL`, `S3_ENDPOINT` (when clients see presigned URLs), and the Vite build vars below.
- Keep `CHAT_ENABLED=false` and plan `VITE_CHAT_ENABLED=false` for the dashboard build.
- Set strong `KIOSK_JWT_SECRET` and MinIO/Postgres passwords if the LAN is not fully trusted.

Optional: pull `BACKEND_IMAGE=ghcr.io/memphis-iis/vellum-rift/backend:<tag>` if you will not build the backend locally.

### 2.2 Ingest manuscripts (optional but typical)

With Postgres + MinIO + backend running (party profile or local dev):

1. Start stack or `make infra-up` + `npm run dev` in `backend/`.
2. Sign in as local developer on the dashboard (§4).
3. Create/open a Space and upload manuscripts through the host path so assets land in MinIO before you disconnect WAN.

Replicate the same `.env` / database volume on the party server so ingested assets travel with Postgres + MinIO data (or re-upload once on the LAN if you prefer a fresh volume).

### 2.3 LAN-targeted Unity builds (#295)

Committed SampleScene defaults point at IIS. For LAN parties, bake the API URL at **build time** (does not change IIS defaults in git):

```bash
export VELLUM_BUILD_BACKEND_URL="http://<SERVER_LAN_IP>:4000"
export VELLUM_BUILD_ALLOW_INSECURE_HTTP=1   # required for http:// LAN API on Quest/WebGL

# WebGL (Unity Editor closed)
./vr-client-unity/scripts/build-webgl-museum.sh

# Quest APK
./vr-client-unity/scripts/build-android-quest.sh
```

Runtime overrides still work for dev (`VELLUM_BACKEND_URL`, `-backendUrl`, etc.) — see [multiplayer-demo-runbook.md](multiplayer-demo-runbook.md).

### 2.4 Dashboard + WebGL artifacts (compose path)

Set LAN Vite URLs in `infra/deploy/lan-party/.env` (see `.env.example`):

- `VITE_API_BASE_URL=http://<SERVER_LAN_IP>:4000`
- `VITE_WEBGL_BASE_URL=http://<SERVER_LAN_IP>:8080/`
- `VITE_AUTH_REQUIRED=false`, `VITE_CHAT_ENABLED=false`

Copy the Unity WebGL museum build into the compose volume directory:

```bash
rsync -a --delete "vr-client-unity/Vellum Rift/web build/" infra/deploy/lan-party/webgl/
```

`docker compose up -d` builds the dashboard from `Dockerfile.dashboard` (bakes `VITE_*`) and serves WebGL from `./webgl` via nginx (`WEBGL_DIST` / `WEBGL_PORT`).

**Manual alternative (no dashboard compose build):** from `web-dashboard/`, `pnpm install && pnpm build` with the same exports, then serve `dist/` on **5173**; publish WebGL with any static host on **8080** (Unity needs correct `Content-Encoding` for `.br` — see `infra/deploy/lan-party/nginx-webgl.conf`).

## 3. Air-gap bring-up

On the party server (from `infra/deploy/lan-party/`):

```bash
cp .env.example .env   # if not done in prep; edit SERVER_LAN_IP + VITE_* + secrets
# WebGL build must already be under ./webgl (or WEBGL_DIST)
docker compose up -d
curl "http://<SERVER_LAN_IP>:4000/api/health"
curl -I "http://<SERVER_LAN_IP>:5173/"
curl -I "http://<SERVER_LAN_IP>:8080/"
```

Confirm backend env:

- `CHAT_ENABLED=false` (chat API/UI off; help and ControlsGuide remain — #293)
- `AUTH_REQUIRED` unset/false
- **No** `webrtc-sfu` container — polling only

Services published for guests on Wi‑Fi: backend **4000**, dashboard **5173** (default), WebGL **8080** (default).

Alternative without containerized backend: root `make infra-up`, then run `npm run dev` in `backend/` with the same env vars (`DATABASE_URL` / `S3_ENDPOINT` toward localhost on the server process; clients still use `SERVER_LAN_IP:4000`). You can still run only `web-dashboard` and `webgl` from this compose file, or serve static assets manually.

**Still required outside compose:** Quest APK sideload/install; host kiosk **Space** / Event setup on the dashboard; IIS Memphis production deploy is unchanged.

## 4. Host flow

1. Open `http://<SERVER_LAN_IP>:5173` (or your `DASHBOARD_PUBLIC_URL`).
2. **Continue as local developer** (no Bluekey on air-gapped LAN).
3. Create or open a **Space** → Enter lobby.
4. Host tools:
   - Enable **Kiosk on** for walk-up guests.
   - Mark the Space as **Event** (`PATCH /api/game-state/:id/event` or dashboard control) so Quest `GET /api/kiosk/events` lists it.
   - Upload or confirm manuscripts in the playlist.
5. Share LAN URLs:
   - Kiosk link / QR (`?session=<id>&kiosk=1`) — see [museum-guest-entry.md](museum-guest-entry.md).
   - Optional observer link for a wall PC (`spectator=1` / observer mode).
6. Keep the host **Enter** tab open while guests play — **Call for help** alerts render here (§6).

## 5. Guest flow

### Browser (laptop / phone)

1. Scan kiosk QR or open the kiosk URL (no account).
2. Nametag → **Enter 3D** (WebGL against `VITE_WEBGL_BASE_URL`).

### Meta Quest

1. Install the LAN-built APK (sidequest/USB/adb as you normally would).
2. Launch — public **events** list comes from `GET /api/kiosk/events` (active Event + kiosk on).
3. Pick the party event (or auto-join when only one is open) and enter the session.

Guests use **Call for help** in-world when stuck; they do not need dashboard chat.

## 6. Verification checklist

Run through this on the LAN before guests arrive.

| Check | Expected |
|-------|----------|
| `GET /api/health` from a guest device | `{"status":"ok",...}` |
| Dashboard lobby | **No** chat panel / send box when `VITE_CHAT_ENABLED=false` |
| WebGL / Quest in session | **No** in-game text chat UI when backend `CHAT_ENABLED=false` |
| ControlsGuide (wrist / help gesture) | Still opens control reference (#293) |
| Guest taps **Call for help** | Host Enter screen shows **Call for help** banner with guest name + time (#294) |
| Host taps **Acknowledge** | Banner entry clears; guest can request again after cooldown |
| Two clients in one session | Each sees the other via polling (~10 Hz) — [multiplayer-demo-runbook.md](multiplayer-demo-runbook.md) |
| Quest event picker | Party Space appears when marked Event + kiosk on |

Quick chat-off probes:

```bash
# Backend chat flag (messages route should 403/disabled when off — see backend tests)
curl -s "http://<SERVER_LAN_IP>:4000/api/health"
```

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Guest cannot reach `:4000` | Server bound to localhost only | Docker publish `4000:4000`; dev backend listen on `0.0.0.0`; check firewall on LAN server |
| WebGL loads but session/bootstrap fails | Wrong API URL in build | Rebuild dashboard/WebGL with `VITE_API_BASE_URL` / `VELLUM_BUILD_BACKEND_URL` set to `http://<SERVER_LAN_IP>:4000` |
| Quest still hits IIS | APK built without overrides | Rebuild with `VELLUM_BUILD_BACKEND_URL` + `VELLUM_BUILD_ALLOW_INSECURE_HTTP=1` |
| Quest shows no events | Space not Event and/or kiosk off | Host enables kiosk and sets kind **event** |
| Kiosk join 401/403 | `KIOSK_JWT_SECRET` mismatch or rate limit | Same secret in `.env` across restarts; wait out kiosk rate window |
| Chat still visible | Env not applied to running/build | Backend `CHAT_ENABLED=false`; dashboard build `VITE_CHAT_ENABLED=false`; restart backend |
| Help banner never appears | Host not on Enter, or not session host | Host opens Enter for that `sessionId`; guest must send help from in-game button |
| MinIO/upload errors | Wrong `S3_ENDPOINT` | LAN IP in `.env` for client-visible URLs; in-compose backend uses `http://minio:9000` |
| `docker compose` pull fails offline | No pre-pulled images | Pull images during prep or build backend from repo Dockerfile |

## 8. Non-goals (this profile)

- **Bluekey / `AUTH_REQUIRED=true`** — use [iis-memphis](../deploy/iis-memphis/README.md) instead.
- **WebRTC SFU** (`webrtc-sfu`, `:4100`, ICE) — not started for LAN party; do not expect voice or SFU presence.
- **Memphis Caddy / auto-deploy** — unrelated; never merge lan-party env into IIS production host.
- **WAN-dependent features** — Bluekey login, external telemetry, fetching GHCR at showtime.

## References

- Deploy: [infra/deploy/lan-party/README.md](../../infra/deploy/lan-party/README.md)
- Museum/kiosk UX: [museum-guest-entry.md](museum-guest-entry.md)
- Polling multiplayer: [multiplayer-demo-runbook.md](multiplayer-demo-runbook.md)
- Build overrides: issue #295, `vr-client-unity/scripts/build-webgl-museum.sh`, `build-android-quest.sh`
