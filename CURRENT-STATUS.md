# Current Status

Vellum Rift is in active early delivery: Milestone 1 (asset pipeline) is largely implemented on the backend, and Milestone 2 session features are partially available over HTTP polling. The repository is past pure ideation, but several product surfaces (SFU, full dashboard, speech, shader/palette exploration) remain incomplete.

GlyphWitch integration is **not** a current expectation. Auth for Vellum Rift APIs is Bluekey when enabled; durable state is Postgres via the Express REST API.

## What Exists Today

### Documentation And Planning

- product vision, architecture ADRs, onboarding, governance, security, and QA docs under `docs/`
- shared vocabulary in [docs/reference/glossary.md](docs/reference/glossary.md)
- contribution and CI expectations documented (see also living workflows under `.github/workflows/`)

### Local Infrastructure

- Docker Compose stack for Postgres, MinIO, and optional tools / speech services
- workspace onboarding via `pnpm onboard` / `pnpm onboard:speech`
- application durable state is accessed through Express + `pg` (not through a GraphQL subscription layer)

### Backend (`backend/`)

- async upload → job queue → preprocessing pipeline (channel extraction, height maps, glTF)
- asset manifest, LoD tiers, glTF model serving, and processing progress reporting
- migration runner: `pnpm migrate` (`backend/src/migrations/`)
- session / game-state API over REST with polling clients: chat, summon, lasers, spatial artifact schema
- Bluekey `requireAuth` middleware (active when `AUTH_REQUIRED=true`; stub user in local dev otherwise)
- unit/integration test coverage for core routes and libraries
- container image build/publish path for GHCR (see Build and Publish workflow)

### WebRTC SFU (`webrtc-sfu/`)

- health-only placeholder service on `:4100`
- container image build/publish path for GHCR

### Web Dashboard (`web-dashboard/`)

- Vite + React shell with early session chat / spatial room wiring
- not yet a full upload, invite, auth/EULA, or WebGL-hosting control surface

### Unity Client (`vr-client-unity/Vellum Rift`)

- multiplayer demo path (HTTP polling), flight/controls work, remote glTF loading, session link overlays
- additional session UX (chat, summon, lasers, artifacts, Bluekey client helpers) present in the project tree; treat maturity as demo / WIP rather than production-complete

### Speech (`infra/speech/`)

- Faster-Whisper and Piper orchestration scaffold for local Compose
- Piper synthesis and end-to-end chat/speech bridging are not product-complete

### CI/CD

- `CI` workflow: pnpm install, lint, backend tests, build (corepack bootstrap fixed)
- `Build and Publish` workflow: Docker images for backend, SFU, and dashboard to GHCR

## What Does Not Exist Yet (Or Is Incomplete)

- production-ready WebRTC SFU (signaling, media, authenticated data channels)
- completed hosted dashboard (upload UI, session browse/entry, EULA gating, Unity WebGL embed)
- WebRTC presence path (clients still use ~10 Hz HTTP polling for Demo 1-style multiplayer)
- local palette / Z-axis shader exploration pipeline in Unity
- completed Piper TTS wiring and STT integration into collaboration flows
- store / production hosting readiness for Quest and Steam builds
- finalized team ownership assignments or operating roles

## Milestone Position

| Milestone | Intent | Rough status |
|-----------|--------|--------------|
| 1 — Asset pipeline & solo exploration | Upload, preprocess, explore assets | Backend largely in place; dashboard/WebGL/palette gaps remain |
| 2 — Session persistence & coordination | Shared sessions, host rules, summon, artifacts | Partial via REST/polling + schema; not SFU-backed |
| 3 — Realtime communication & accessibility | Voice, radar, speech bridge | Mostly not started (SFU placeholder; speech incomplete) |
| 4 — Spatial authoring & release readiness | Strokes, optimization, store readiness | Not started |

See [docs/agile/milestones.md](docs/agile/milestones.md).

## Primary Goal Right Now

Ship the next product slices on top of the working backend and Unity demo paths, while keeping docs and CI aligned with reality.

Near-term focus:

- finish Milestone 1 client/dashboard gaps that block solo exploration in hosted web
- harden auth and route policy for shared/test hosts
- replace HTTP polling with an authenticated SFU path when realtime work begins
- keep architecture and status docs updated in the same change sets as behavior changes

## Working Expectation

Prefer working vertical slices over expanding scaffold-only packages. Strong docs remain required when architecture, auth, or operational policy changes. Incomplete subsystems (SFU, speech, dashboard) should be described as incomplete—not as production-ready.

## Read Next

- [ONBOARDING.md](ONBOARDING.md)
- [docs/product-summary.md](docs/product-summary.md)
- [docs/reference/glossary.md](docs/reference/glossary.md)
- [docs/README.md](docs/README.md)
- [docs/agile/milestones.md](docs/agile/milestones.md)
