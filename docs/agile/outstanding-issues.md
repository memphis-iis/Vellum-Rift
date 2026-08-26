# Outstanding Issues & Feature Backlog

> **Status:** Tracked source of truth (committed under `docs/agile/`).
> **Purpose:** Consolidated backlog of implementation gaps and feature requirements for Vellum Rift.
> **Last reviewed:** 2026-08-26
> **Scope note:** GlyphWitch integration / workflow is **out of scope for now**. Do not treat missing GlyphWitch surfaces as current blockers. Auth is Bluekey when enabled; durable APIs are Express + Postgres.

Related living docs: [CURRENT-STATUS.md](../../CURRENT-STATUS.md), [milestones.md](milestones.md), GitHub issues [#98](https://github.com/memphis-iis/Vellum-Rift/issues/98)–[#105](https://github.com/memphis-iis/Vellum-Rift/issues/105).

---

## Priority Legend

- **MVP-blocking** — Required to reach Milestone 1 (asset pipeline & solo exploration) or unblock hosted web exploration.
- **Foundational** — Needed before Milestone 2/3 (shared sessions, realtime communication).
- **Later milestone** — Milestone 3/4 or release readiness.

---

## Section 0: Completed Or Largely Delivered

These items were open on 2026-08-10 and are now done (or demo-complete on the REST/polling path) on `main`. Keep IDs for traceability; do not re-open without new scope.

| ID | Outcome | Evidence |
|----|---------|----------|
| IMPL-001–003 | Async upload + preprocessing job queue | `POST /api/upload`, `JobQueue`, channel modes |
| IMPL-004 | Asset manifest schema | `/api/assets`, `docs/reference/asset-manifest-schema.md` |
| IMPL-005 | LoD tiers / budgets | `/api/lod-tiers`, issue #90 |
| IMPL-006 | Processing progress reporting | `/api/jobs`, issue #92 |
| IMPL-008 / IMPL-010 | Session / participant / spatial schema | `backend/src/migrations/001_initial_schema.sql` (`vr_sessions`, participants, artifacts) |
| IMPL-009 | Real migration runner | `pnpm migrate`, `backend/src/lib/migrate.ts` |
| IMPL-011 (partial) | Spatial artifact CRUD over game-state API | `/api/game-state/:id/artifacts*` (JSONB metadata). Dedicated `vr_spatial_artifacts` table persistence still optional follow-up. |
| IMPL-018 | Flight / locomotion controller | Unity `PlayerController` / related issues (#95 lineage) |
| IMPL-019 | Progressive / remote glTF loading | `RemoteModelLoader`, issue #96 lineage |
| FTR-002 (partial) | Host summon over REST | `/api/game-state/:id/summon*` + Unity `SummonManager` |
| FTR-004 (partial) | Session text chat over REST (not GlyphWitch) | `/api/game-state/:id/chat*` + dashboard/Unity chat surfaces |
| FTR-009 (partial) | Role-based laser pointers over REST | `/api/game-state/:id/laser*` + Unity `LaserPointer` |
| CI bootstrap | Node CI pnpm install/lint/test/build | Issues #98 / PR #106 |
| Image publish | GHCR Docker builds for backend/SFU/dashboard | Issues #99 / PR #107 |
| IMPL-030 | Route auth audit: jobs/assets/lod-tiers protected | GitHub #103 |

Still open related work: invite/completion **notifications** remain tracked as GitHub [#94](https://github.com/memphis-iis/Vellum-Rift/issues/94) (IMPL-007).

---

## Section 1: Outstanding Implementation Issues

### A. Ingestion / Notifications

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-007 | Invite / completion notification system incomplete | MVP-blocking | GitHub #94 — email/invite completion path |

### B. Persistence & Durable State

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-011b | Promote spatial artifacts from session JSONB metadata to durable `vr_spatial_artifacts` (export/restore) | Foundational | API exists; table exists; wiring incomplete |

### C. WebRTC SFU

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-012 | SFU is health-only placeholder | Foundational | **Partial** — signaling + auth in #104; media relay still TBD |
| IMPL-013 | Authenticated signaling (offer/answer or join) | Foundational | **Done** via #104 (`/api/realtime/token` + SFU `/v1`) |
| IMPL-014 | Presence / movement packet contract + streaming | Foundational | **Partial** — contract documented/typed; client streaming = IMPL-022 |

### D. Client — Web Dashboard

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-015 | Dashboard scaffold: missing upload UI, session browse/entry, auth & EULA gating, fuller API client | MVP-blocking | Early chat/spatial room only |
| IMPL-016 | Unity WebGL embedding / browser↔Unity interop | MVP-blocking | |
| IMPL-017 | Web controls (WASD/mouse/joystick) productized in hosted web client | MVP-blocking | Unity desktop controls exist; hosted web path incomplete |

### E. Client — Unity / VR

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-020 | Local palette / Z-axis shader controls | MVP-blocking | SDD 003 |
| IMPL-021 | Radar / session-awareness HUD (web + VR visor) | Foundational | |
| IMPL-022 | Replace 10 Hz HTTP polling with WebRTC presence | Foundational | Depends on IMPL-012–014 |

### F. Speech Stack

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-023 | Piper synthesis not wired (`/synthesize` 501) | Later milestone | |
| IMPL-024 | Faster-Whisper not integrated into collaboration flows | Later milestone | |

### G. Release Readiness / Tooling

| ID | Issue | Priority | Notes |
|----|-------|----------|-------|
| IMPL-025b | Unity WebGL headless CI gate still missing | Later milestone | Node CI + GHCR publish exist; docs still overclaim Unity CI |
| IMPL-026 | Confirm Unity project tracking / CI ownership under monorepo | MVP-blocking | Project lives under `vr-client-unity/`; policy + CI decision still needed |
| IMPL-027 | EULA gating across clients | Foundational | No GlyphWitch EULA dependency assumed for now — define Vellum-local or deferred gate |
| IMPL-031 | Align CI/CD and agent docs with actual stack | Foundational | GitHub #102 |
| IMPL-032 | Fix auth / reference doc drift | Foundational | **Done** via #105 |

### H. LLM Visual Extraction (IMPL-029)

**ID:** IMPL-029  
**Priority:** Later milestone  
**Dependencies:** Upload pipeline (done), glTF serving (done), dashboard viewer (IMPL-015)

#### Summary

On document upload, invoke an LLM vision API (Gemini, OpenAI, Deepseek, or configurable provider) to extract non-text visual elements, crop them from the source page, store cropped images, and expose a gallery beside the 3D mesh.

#### Motivation

Heightmap meshes treat illustrations and text as the same geometry. Scholars need browsable cropped characters/illustrations with labels and navigation affordances.

#### Design sketch (retained)

- Provider abstraction in `backend/src/lib/llmVision.ts` (`LLM_VISION_PROVIDER`, API keys, `none` skip path)
- Two-phase flow: LLM bounding boxes → `sharp` crops from full-res page → MinIO + `extracted_elements` table
- APIs: `GET/PATCH /api/models/:modelId/elements…` and image serve
- Dashboard gallery panel; VR framing deferred
- Non-blocking on mesh generation failure paths

#### Open questions

1. Opt-in per upload vs always-on when enabled?
2. Custom prompts per upload?
3. User correction UX for labels (PATCH now vs later)?
4. Page bbox → 3D mesh mapping strategy?
5. Max crop dimension for large TIFFs?
6. Separate per-element meshes (deferred)?

#### Estimate

Roughly 10–15 days across provider, schema, queue, APIs, dashboard panel, and tests.

---

## Section 2: Feature Requirements (Still Open Or Partial)

### FTR-001: Radar / Session Awareness

**Description:** Web minimap radar and VR visor awareness of other participants.  
**Priority:** Foundational  
**Dependencies:** Presence contract (IMPL-014), ideally SFU (IMPL-012).  
**Status:** Not implemented.

### FTR-002: User Summoning Group Controls

**Description:** Host summon with countdown and client confirmation UI.  
**Priority:** Foundational  
**Status:** **Partial** — backend summon API + Unity manager exist on REST/polling path; polish confirmation UX and host-migration edge cases as needed.  
**Out of scope for now:** GlyphWitch-backed authority models.

### FTR-003: Waypoints / Spatial Pins UX

**Description:** Create, edit, delete, and navigate to pins/save points with clear client UX.  
**Priority:** Foundational  
**Status:** **Partial** — artifact CRUD API + Unity helpers exist; durable table export/HUD polish remain (IMPL-011b, IMPL-021).

### FTR-004: Keyboard Communication for Desktop Users

**Description:** Text chat for desktop/web users, visible to VR participants.  
**Priority:** Foundational  
**Status:** **Partial** — session chat via game-state API (not GlyphWitch document chat). Dashboard/Unity surfaces exist; productize and persist policy as needed.  
**Out of scope for now:** GlyphWitch chat reuse.

### FTR-005: VR Interface

**Description:** Visor HUD covering radar, chat, waypoints, summon, session controls.  
**Priority:** Foundational  
**Dependencies:** FTR-001, FTR-003, FTR-004.  
**Status:** Not complete.

### FTR-ADDENDUM: Mobile Interface

Dual-joystick style interface for mobile.  
**Priority:** Later milestone  
**Status:** Not started.

### FTR-006: Text-to-Speech

Desktop text → Piper → VR audio.  
**Priority:** Later milestone  
**Dependencies:** IMPL-023.

### FTR-007: Speech-to-Text

VR voice → Faster-Whisper → desktop text.  
**Priority:** Later milestone  
**Dependencies:** IMPL-024.

### FTR-008: Invites And Sharing UI

Dashboard invite/share/enter flows.  
**Priority:** MVP-blocking  
**Dependencies:** IMPL-015; session model (delivered); notifications (IMPL-007 / #94).  
**Status:** Session link overlays exist in Unity/WebGL paths; full dashboard invite UX incomplete.

### FTR-009: Laser Pointers

**Status:** **Partial** — REST laser API + Unity component delivered; realtime SFU path deferred with IMPL-012–014.

---

## Section 3: Cross-Cutting Dependencies

| Dependency | Needed By | Status |
|------------|-----------|--------|
| Presence/movement packet contract | FTR-001, IMPL-014 | Documented + typed (#104); client stream = IMPL-022 |
| Durable `vr_spatial_artifacts` wiring | FTR-003, IMPL-011b | Schema + JSONB API; table wiring incomplete |
| SFU signaling + media + data | FTR-001, IMPL-012–014, #104 | Signaling + auth done; media relay TBD |
| Piper synthesis | FTR-006 | 501 / not wired |
| Faster-Whisper chat integration | FTR-007 | Endpoint exists, not integrated |
| Migration tooling | — | **Done** (`pnpm migrate`) |
| Node CI + GHCR publish | — | **Done** (#98, #99) |
| Unity WebGL CI gate | IMPL-025b | Pending |
| GlyphWitch workflows | — | **Out of scope for now** |

---

## Section 4: Priority Matrix (Current)

### MVP-blocking

- IMPL-007 / #94 (notifications)
- IMPL-015, IMPL-016, IMPL-017 (dashboard + hosted web controls)
- IMPL-020 (palette / shader)
- IMPL-026 (Unity tracking/CI ownership decision)
- FTR-008 (invites/sharing UI)

### Foundational

- IMPL-011b (artifacts durability)
- IMPL-012 (media relay), IMPL-014 remainder / IMPL-022 (WebRTC presence)
- IMPL-021 (radar)
- IMPL-027 (EULA gating — Vellum-local definition)
- IMPL-031 / #102 (doc accuracy; IMPL-032 / #105 done)
- FTR-001, FTR-005; finish FTR-002/003/004/009 polish

### Later milestone

- IMPL-023, IMPL-024 (speech)
- IMPL-025b (Unity WebGL CI)
- IMPL-029 (LLM visual extraction)
- FTR-006, FTR-007, mobile addendum
