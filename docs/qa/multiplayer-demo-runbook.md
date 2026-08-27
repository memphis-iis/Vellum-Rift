# Demo 1: Multiplayer Proof-of-Concept — Runbook

Issue: https://github.com/memphis-iis/Vellum-Rift/issues/44

Goal: two Unity clients in one shared session, each seeing the other as a
moving cube. Backend-polling only (no WebRTC).

## Architecture (what runs where)

```
[Unity client A] ──HTTP──▶ [backend :4000] ◀──HTTP── [Unity client B]
                                │
                     [Postgres / MinIO]
```

- The **backend** is the single source of truth for sessions, players,
  positions, and rotations.
- Clients **poll** the session (default 10 Hz) and render remote players as
  cubes (assigned prefab or a default cube).
- Each client **pushes** its own position/rotation every `sendPositionInterval`
  via `MultiplayerController.SendLocalPlayerPosition`.

## Prerequisites

- Docker (for Postgres/MinIO)
- Node.js for the backend
- Unity 6 with the `vr-client-unity/Vellum Rift` project

## 1. Start the backend

```bash
make init-env          # create .env files from templates (first time)
make infra-up          # postgres + minio
cd backend
npm install            # first time
npm run dev            # backend on http://localhost:4000
```

Verify: `curl http://localhost:4000/api/health` → `{"status":"ok",...}`

## 2. Scene wiring (one-time, Unity Editor)

`DemoSession` is self-contained: it auto-creates `GameStateApiClient`,
`GameStatePoller`, `PlayerSpawner`, and `MultiplayerController` on its own
GameObject, so the only wiring required is:

1. Open `Assets/Scenes/SampleScene.unity`.
2. Add a new empty GameObject (e.g. `Network`).
3. Add the **DemoSession** component to it.
4. (Recommended) Set **Local Player Object** to the scene's controlled
   `Player` rig so your cube mirrors your movement.
5. Leave **Session ID** empty on the first client (it creates the session and
   logs the id); set it on every other client.

Optional niceties (not required for the POC):
- To use a custom visual instead of the default cube, call
  `playerSpawner.SetPlayerPrefab(...)` from code (e.g. in a scene script), or
  add a `PlayerSpawner` component in the scene yourself and assign its
  **Player Prefab** / spawn points in the Inspector *before* Play — the
  auto-created component exists only at runtime and is not editable.
- Point `BackendHealthChecker` at the backend for a startup connectivity readout.

## 3. Run the demo

1. Press Play in the first client (Editor or standalone build). The Console
   logs: `[DemoSession] Created session <id> — paste this id into the other
   client's sessionIdOverride field`.
2. Copy that `<id>`.
3. In the second client's `DemoSession`, set **Session ID** to the copied id
   and press Play. The Console logs `[DemoSession] Joined existing session ...`.
4. Both clients should log `[DemoSession] Ready`.

Expected behavior:
- Each client sees the other's cube spawn (at the reported position, else a
  spawn point / default offset).
- Moving the controlled player on one client moves the other client's cube
  (within one poll interval, ~100 ms + latency).
- Rotations follow Euler angles reported by the server.
- Stopping a client (best-effort quit hook, or calling `LeaveSession()` from
  a button) removes its cube from the other client within a poll interval.

## LAN / remote backend

The backend URL resolution order is: `-backendUrl=` CLI flag, then
`-backendHost`/`-backendPort` CLI flags, then `VELLUM_BACKEND_URL` (or
`VELLUM_BACKEND_HOST`/`VELLUM_BACKEND_PORT`) env vars, then the Inspector
default (`http://localhost:4000`).

- Standalone builds: `./client -backendUrl=http://192.168.1.50:4000`
- Editor Play Mode: CLI flags are ignored (they belong to the Editor process);
  set `VELLUM_BACKEND_URL=http://192.168.1.50:4000` before launching the Editor,
  or edit the Inspector field.

Note: `VELLUM_BACKEND_URL` must be a **base** URL (`http://host:4000`), not the
health-check path.

## Desktop / launcher session handoff (issue #128)

Standalone (and Editor via env) can **join** an existing session without pasting
into the Inspector. The Enter launcher should also pass the signed-in Bluekey
display name (or email) and whether the user is the session host/administrator.

### Session id (first non-empty wins)

1. CLI: `-session=<uuid>`
2. Env: `VELLUM_SESSION_ID=<uuid>`
3. WebGL only: page query `?session=<uuid>`
4. Inspector **Session ID** on `DemoSession` (empty → create a new session)

### Player name (Bluekey)

1. CLI: `-playerName=<name>`
2. Env: `VELLUM_PLAYER_NAME=<name>`
3. WebGL: `?playerName=<name>`
4. In-client Bluekey identity (`BluekeyAuth.UserDisplayName` / email), when present
5. Inspector **Player Name**

### Host / administrator

1. CLI: `-isHost=true|false` (alias `-admin=true|false`)
2. Env: `VELLUM_IS_HOST=true|false`
3. WebGL: `?isHost=true|false`
4. If unspecified: session **creator** is host; on join, first client adopts host
   when the session has no `hostId` yet; otherwise join as participant

Examples:

```bash
# Join as Bluekey user "Alex" who is the session host
./VellumRift.x86_64 \
  -backendUrl=http://192.168.1.50:4000 \
  -session=7e3f9c2a-4b1d-4e6f-9c8a-2d5b7f0e1a3c \
  -playerName=Alex \
  -isHost=true

# Same via env (also works for Editor Play Mode)
export VELLUM_BACKEND_URL=http://192.168.1.50:4000
export VELLUM_SESSION_ID=7e3f9c2a-4b1d-4e6f-9c8a-2d5b7f0e1a3c
export VELLUM_PLAYER_NAME=Alex
export VELLUM_IS_HOST=true
```

`DemoSession` **joins** that id (does not end/recreate). If the session is
missing, bootstrap fails with a clear `Session '<id>' not found` error.
After ready, `DemoSession.PlayerDisplayName` and `DemoSession.IsHost` reflect
the resolved identity.

Custom URL scheme (`vellumrift://…`) is deferred; the Enter launcher should
invoke the desktop binary with these flags/env vars for MVP.

## Known limitations (acceptable for Demo 1)

- **One shared session**: no session discovery/join UX. The id is copy-pasted.
- **Quit cleanup is best-effort**: Unity may kill the process before the
  leave request lands (especially in the Editor). For clean removal, call
  `DemoSession.LeaveSession()` from a button, or delete the session via the
  backend. A lingering cube disappears once the session is ended/recreated.
- **No heartbeat**: a crashed client's player stays in the session until
  removed or the session is deleted.
- **Polling latency**: ~100 ms default; fine for a cube POC, not for
  fast-paced gameplay (that's WebRTC territory).
- **Not validated in CI**: the demo is manually verified (see issue #44's
  definition of done). Unity EditMode tests cover `PlayerSpawner` (15 tests).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Bootstrap failed: ... backend running?` | Start backend (`make infra-up`, `npm run dev` in `backend/`); check `/api/health` |
| `Session '<id>' not found` | Wrong/pasted-with-extra-space id, or backend restarted since creation |
| Cubes spawn but never move | `Local Player Object` not set on the moving client — its cube never mirrors movement |
| Other client doesn't see a cube at all | Both clients must use the **same session id**; check Console logs for `Ready` |
| LAN client can't reach backend | Backend bound to `localhost`; run with `HOST=0.0.0.0` and set `VELLUM_BACKEND_URL` on the client |
