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

### Documents (3D model viewer)

The Documents section lists processed meshes from `GET /api/models` in a dropdown, then loads the selected GLB via authenticated `GET /api/models/:modelId` (blob URL) into [`@google/model-viewer`](https://modelviewer.dev/) (orbit / zoom). Completed Upload jobs can open Documents with **View in Documents**. Metadata comes from `GET /api/models/:modelId/meta`.

### Sessions (exploration list)

The Sessions section lists `GET /api/game-state` rows (name, LIVE/READY/ARCHIVED, last activity). **New Session** calls `POST /api/game-state` (optional label). Open/Enter navigates to the Enter placeholder with the session ID; archive uses `DELETE`, restore uses `POST /api/game-state/:id/resume`.

### Enter launcher contract (desktop handoff)

Enter UI (#127) should launch the standalone Unity client with the chosen session id (join, do not recreate):

- Preferred: `-session=<uuid>` (and optional `-backendUrl=` matching `VITE_API_BASE_URL`)
- Or env: `VELLUM_SESSION_ID` / `VELLUM_BACKEND_URL`

WebGL continues to use `?session=` on the page URL. Custom scheme (`vellumrift://`) is Phase 2. See [multiplayer-demo-runbook.md](../qa/multiplayer-demo-runbook.md#desktop--launcher-session-handoff-issue-128).

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
