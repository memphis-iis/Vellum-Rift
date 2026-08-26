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
