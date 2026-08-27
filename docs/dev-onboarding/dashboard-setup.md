# Dashboard Setup

This document covers the local setup and working conventions for the Vite and React dashboard package in `web-dashboard/`.

## Purpose

The dashboard is the hosted web control surface for Vellum Rift. It will grow into the primary browser experience for:

- document upload and preprocessing status
- session browsing and invite entry
- team and permission management
- export and review of non-PII research artifacts
- embedding or linking into the Unity WebGL experience where needed

## Package Location

- `web-dashboard/`

## Stack

- Vite
- React
- TypeScript

## First-Time Setup

From the repository root:

```bash
corepack enable
pnpm install
pnpm onboard
```

If you also want the speech stack available locally:

```bash
pnpm onboard:speech
```

## Run The Dashboard By Itself

From the repository root:

```bash
pnpm dashboard:dev
```

Expected local URL:

- `http://localhost:5173`

## Run The Full Workspace

To run backend, SFU, and dashboard together:

```bash
pnpm dev
```

## Build And Validation

From the repository root:

```bash
pnpm --filter @vellum-rift/web-dashboard lint
pnpm --filter @vellum-rift/web-dashboard build
```

Or use the workspace-wide equivalents:

```bash
pnpm lint
pnpm build
```

## Files You Will Touch First

- `web-dashboard/src/App.tsx`
- `web-dashboard/src/main.tsx`
- `web-dashboard/src/styles.css`
- `web-dashboard/vite.config.ts`

## Current State

The dashboard is currently a scaffolded shell rather than a full product surface.

What exists now:

- a monorepo package wired into the root workspace
- a Vite dev server and production build
- a first-pass landing shell for local stack visibility

What should come next:

- route structure for uploads, sessions, and teams
- fuller API client using Bearer tokens from Bluekey session
- EULA gating flows (Vellum-local)
- WebGL embedding or launch flow; post-login VR theme

### Bluekey login (issue #114)

The dashboard shows the IIS Bluekey login shell (Undertaker template) until the user signs in.

1. Copy `web-dashboard/.env.example` to `web-dashboard/.env`
2. Set `VITE_BLUEKEY_SOFTWARE_ID` for real SSO
3. Leave `VITE_AUTH_REQUIRED` unset for local work — use **Continue as local developer**
4. On shared hosts set `VITE_AUTH_REQUIRED=true` (hides the local skip)

Logo lockup uses `https://iis.memphis.edu/static/bluekey/icons/vellumrift.png` plus the Memphis pillar.

### Post-login home (VR theme)

After sign-in, the app uses a black shell with side nav (desktop) / top bar (mobile), Epilogue + Hanken Grotesk, cyan logo accents for primary CTAs, and parchment-gold secondary buttons. Brand mark: `/vellumrift-mark.png`.

Optional ambient video on Home: add `web-dashboard/public/home-bg.webm` or set `VITE_HOME_BG_VIDEO_URL` (muted loop under the fog layer).

### Upload (manuscript ingestion)

The Upload section is a dropzone + active job list. Users must enter a **document title** (sent as multipart `label`) before selecting files. It posts to `POST /api/upload` and polls `GET /api/jobs/:jobId`. Point `VITE_API_BASE_URL` at the backend (default `http://localhost:4000`). Enter remains a placeholder (receives session ID from Sessions).

### Documents (manuscript library)

The Documents section lists processed meshes from `GET /api/models` in a dropdown, then loads the selected GLB via authenticated `GET /api/models/:modelId` (blob URL) into [`@google/model-viewer`](https://modelviewer.dev/) (orbit / zoom). Completed Upload jobs can open Documents with **View in library**. Metadata comes from `GET /api/models/:modelId/meta`.

**Bind to a learning space (#142):** with a manuscript selected —
- **Open in new space** — `POST /api/game-state` then `PATCH …/playlist` with `playlist: [modelId]` and `activeModelId`, then navigates to Enter
- **Add to existing space** — `PATCH …/playlist` with `append` (optional set active). Host-only; non-host errors are shown in the UI.

### Sessions (exploration list)

The Sessions section lists `GET /api/game-state` rows (name, LIVE/READY/ARCHIVED, last activity). **New Session** calls `POST /api/game-state` (optional label). **Launch** opens the Enter Session Room for that id; archive uses `DELETE`, restore uses `POST /api/game-state/:id/resume`.

### Enter (Session Room loadout)

Enter is the pre-flight lobby for a selected session (not a blank placeholder):

- Auto-joins as the signed-in Bluekey user (email local-part as display name); first joiner adopts host when `hostId` is empty
- Spatial presence map + live/ready badges from polled `GET /api/game-state/:id`
- Session chat via `/api/game-state/:id/chat`
- **Enter 3D Experience** opens `VITE_WEBGL_BASE_URL` with `?session=&playerName=&isHost=&backendUrl=` (#128 contract)
- **Desktop** reveals a copyable CLI command (`-session=` / `-playerName=` / `-isHost=`)
- **Copy Invite** / **Leave Session** (back to Sessions)
- **Email Invite** — `POST /api/game-state/:sessionId/invite` via Bluekey mail (`vellum_session_invite`). Requires backend `BLUEKEY_API_TOKEN` + `BLUEKEY_SOFTWARE_ID` (otherwise invite is stored with `deliveryStatus: skipped`).
- Deep link: `?session=<sessionId>` opens Session Room after sign-in.
- **Visibility (#136):** create with Public/Private; private sessions need an allowlist entry (email invite checkbox can add). Host can flip visibility anytime without auto-kick.
- **Host moderation (#137):** Session Room roster (host only) — Mute / Make host / Kick. Kick blocks rejoin by Bluekey identity when stamped.
- **Kiosk / public join (#145):** Host toggles **Kiosk on** → **Copy kiosk link** (`?session=&kiosk=1`). Guests skip Bluekey, pick a nametag, join, and launch WebGL with a short-lived kiosk token. Playlist / moderation / visibility stay host-only.
- **Manuscript playlist (#141):** `GET /api/game-state/:id` returns top-level `playlist` (model id array) and `activeModelId` (also under `metadata`). Host-only:
  - `PATCH /api/game-state/:sessionId/playlist` — `{ playlist?, append?, remove?, activeModelId? }`
  - `PATCH /api/game-state/:sessionId/active-model` — `{ modelId }` (must be in playlist; `null` clears)
  Unity / WebGL should load `/api/models/:activeModelId` and poll for switches (#144).
- **Playlist UI (#143):** Spaces list shows active manuscript (or “No document”). Enter shows playlist; host can **Set active** / **Remove** / **Add from library** (opens Library with that space preselected for Add). Guests see active title only.
- **Unity active model (#144):** WebGL/desktop join an existing `?session=` / `-session=` space (no wipe). Mesh comes from session `activeModelId` (or `-modelId` / `?modelId=` override). Poll hot-swaps when the host changes the active manuscript; empty active clears the mesh.

Set `VITE_WEBGL_BASE_URL` for one-click WebGL launch (see `.env.example`). Signed-in users get a **postMessage auth handoff** into WebGL (no second Bluekey popup when the token is valid); see [authentication.md](../reference/authentication.md#dashboard--webgl-auth-handoff-129).

### Enter launcher contract (desktop handoff)

Enter UI (#127) should launch the standalone Unity client with identity from the
signed-in Bluekey session (join, do not recreate):

| Concern | CLI | Env | Source |
|---|---|---|---|
| Session | `-session=<uuid>` | `VELLUM_SESSION_ID` | Selected exploration session |
| Display name | `-playerName=<name>` | `VELLUM_PLAYER_NAME` | Bluekey display name or email |
| Host/admin | `-isHost=true\|false` (or `-admin=`) | `VELLUM_IS_HOST` | True when this user is the session host |
| Access token | `-accessToken=<jwt>` | `VELLUM_ACCESS_TOKEN` | Dashboard Bluekey token (optional; treat as secret) |
| Backend | `-backendUrl=` | `VELLUM_BACKEND_URL` | Same base as `VITE_API_BASE_URL` |

WebGL uses `?session=` / `?playerName=` / `?isHost=` plus **postMessage** token handoff (never `?accessToken=`). Electron is deferred — [006-electron-launcher-scope.md](../architecture/006-electron-launcher-scope.md).

## Working Conventions

1. Keep the dashboard aligned with current Express + Bluekey contracts (GlyphWitch reuse is out of scope for now).
2. Avoid inventing frontend-only data contracts when a backend contract should exist.
3. Update docs when dashboard flows add new architecture or policy assumptions.
4. Preserve the existing visual direction unless a deliberate redesign is being made.

## Related Docs

- [workspace-setup.md](workspace-setup.md)
- [backend-setup.md](backend-setup.md)
- [../product-summary.md](../product-summary.md)
- [../reference/backend-integration-summary.md](../reference/backend-integration-summary.md)
