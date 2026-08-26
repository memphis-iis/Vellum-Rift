# Backend Integration Summary

## Current direction (active)

Vellum Rift’s durable APIs are the Express + Postgres stack in `backend/`. Auth is Bluekey when `AUTH_REQUIRED=true` (see [authentication.md](authentication.md)). Realtime signaling is the SFU path in [001-webrtc-sfu.md](../architecture/001-webrtc-sfu.md). Persisted session shape is [002-persisted-state-sync.md](../architecture/002-persisted-state-sync.md).

Migrations that apply to this repository live under `backend/src/migrations/` and are applied with `pnpm migrate`.

GlyphWitch document/team ACL, chat reuse, and related manuscript-platform workflows are **out of scope for now**. Do not treat missing GlyphWitch routes as current blockers.

## Historical inventory (out of scope)

[GlyphWitchAPI.md](GlyphWitchAPI.md) is a **historical** route and storage inventory from the GlyphWitch manuscript platform. Many listed paths and `backend/migrations/*.sql` links are **not** present in this monorepo. Use it only when comparing future integration ideas — not as the live Vellum Rift API contract.

Canonical live route source: [backend/src/index.ts](../../backend/src/index.ts).

## What Vellum Rift owns today

- manuscript upload / preprocessing jobs and asset manifests
- game-state session surfaces (presence polling, chat, summon, lasers, artifacts)
- LoD tiers and model metadata
- short-lived SFU signaling tokens (`/api/realtime/token`)

## Preferred extension strategy

1. Add schema through `backend/src/migrations/` and Express routes.
2. Keep high-frequency presence/voice/data on the WebRTC SFU lane.
3. Introduce GlyphWitch compatibility only under an explicit future decision — not as a silent prerequisite for onboarding or MVP.
