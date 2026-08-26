# Engineering Agents Definition & Specialization

This document establishes the explicit boundaries, ownership scopes, and integration patterns for developers and automated AI agents contributing to the Vellum Rift polyglot monorepo.

---

## 1. System Agent Definitions

### Agent A: Core Backend & Data Infrastructure (`@agent-core-backend`)
- **Primary Domain Ownership:** `backend/`, `webrtc-sfu/`, `docs/architecture/`
- **Languages/Stack:** Node.js, TypeScript, PostgreSQL (Hasura GraphQL), Express, WebRTC (Pion/LiveKit or raw SFU orchestration).
- **Core Responsibilities:**
  1. Maintain and extend the existing document/page/annotation schemas (`init.sql`, migrations).
  2. Implement the asynchronous image channel extraction and vector trace `.glb` generator service.
  3. Manage real-time state synchronization hooks for room persistence (sessions, participants, spatial pins, strokes).
  4. Build out the WebRTC media pipeline supporting spatial audio attenuation math and global radio override channels.

### Agent B: XR & Unity Interactive Client (`@agent-xr-unity`)
- **Primary Domain Ownership:** `vr-client-unity/`
- **Languages/Stack:** C#, HLSL (Custom Shaders), Unity OpenXR, Unity Input System, WebGL plugins (`.jslib`).
- **Core Responsibilities:**
  1. Develop cross-platform flight mechanics supporting WASD/mouse/gamepad (Web) and Thumbstick + Jetpack button physics (Meta Quest & SteamVR).
  2. Write high-performance vertex shaders to process the Z-value rendering palettes locally per user.
  3. Implement the dynamic asset streaming loader to fetch and process web-friendly `.glb` chunks over HTTP/S3.
  4. Construct the UI layer: 2D minimap radar HUD for WebGL clients, and a curved world-space visor HUD for immersive VR headsets.
  5. Intercept real-time drawing actions to stream 3D line points smoothly over WebRTC data channels before executing batch saves.

### Agent C: Web Dashboard & UX Bridge (`@agent-web-dashboard`)
- **Primary Domain Ownership:** `web-dashboard/`, `design-assets/`
- **Languages/Stack:** JavaScript/TypeScript, React/Next.js, TailwindCSS, WebRTC Web APIs.
- **Core Responsibilities:**
  1. Build user authentication dashboards, EULA acceptance modules, and account settings panels.
  2. Maintain the main web asset upload pipeline, progress bars, and email notification webhooks.
  3. Host the embedded Unity WebGL build instance and engineer clean browser interop communication layers (`window.dispatch` hooks).
  4. Incorporate browser-native WebRTC handlers and integrate the Speech-to-Text / Text-to-Speech translation APIs to drive accessibility.

---
## 2. Operational Rules & Boundaries

### Rule 1: Schema Truth Preservation
All shared definitions regarding users, sessions, pins, and drawing annotation strokes must originate from the PostgreSQL/Hasura configuration files. No C# networking models may be authored manually. 
- *Enforcement:* Changes to API or DB schemas must be introduced via database migrations under `backend/migrations/`. `@agent-xr-unity` must utilize code generation scripts to transform those entities into native C# structs under `vr-client-unity/Assets/Scripts/Networking/Generated/`.

### Rule 2: WebGL Interop Decoupling
To avoid breaking compilation passes between standalone Android packages (Quest APKs) and desktop build targets, all platform-dependent web browser behavior must be fully abstracted.
- *Enforcement:* Direct web browser or DOM actions inside Unity must be isolated within `.jslib` scripts in `vr-client-unity/Assets/Plugins/WebGL/`. These must be wrapped inside native C# preprocessor macros (`#if UNITY_WEBGL && !UNITY_EDITOR`) to prevent compilation failure on standalone PCVR/Quest deployment targets.

### Rule 3: Architectural Documentation Updates (RFC Policy)
Before any agent introduces structural code alterations impacting the real-time syncing pipelines, the respective implementation designs must be codified in Markdown format.
- *Enforcement:* Modifying networking loops, WebRTC payloads, or adding database tables requires an updated system design document (RFC) inside `docs/architecture/` approved via pull request review prior to feature code implementation.

### Rule 4: GitHub Contribution Workflow (Issue → Code → Test → PR → Review → Merge)
All changes to `main` must flow through the following linear workflow. Direct pushes to `main` are prohibited and enforced via branch protection rules.

```
 Issue Created → Branch Forked → Code Written → Tests Pass → PR Opened → Reviewed & Approved → Squash-Merged → Issue Closed
```

| Step | Requirement | Enforcement |
|---|---|---|
| **1. Issue** | Every piece of work starts with a GitHub Issue (bug, feature, or task). The issue defines scope, acceptance criteria, and linked user story (if applicable). | PRs must reference an issue via `Fixes #<N>` or `Refs #<N>` in the title or body. PRs without a linked issue are rejected during review. |
| **2. Branch** | Work is done on a named feature branch off `main`. Convention: `<agent>/<issue#>-<short-description>` (e.g., `backend/42-add-health-endpoint`). | Branch protection prevents direct pushes to `main`. |
| **3. Code** | Changes follow the agent's domain ownership rules (§1) and coding standards. No cross-domain changes without coordination. | CI typecheck + lint must pass. |
| **4. Test** | New or modified code must include tests (unit, integration, or Unity EditMode). Existing test coverage must not regress. | CI test suite (`pnpm --filter @vellum-rift/backend test`, Unity EditMode tests) must pass as a required check. |
| **5. PR** | A Pull Request is opened targeting `main`. The PR description includes: summary, linked issue, testing notes, and screenshots (if UI). | PR template enforces structure. Draft PRs are encouraged for early feedback. |
| **6. Review** | At least one approving review from a maintainer or peer agent is required before merge. Reviewers check correctness, test coverage, and adherence to RFC/architecture docs. | Branch protection requires ≥1 approved review. Conversational comments must be resolved. |
| **7. Merge** | PRs are **squash-merged** into `main` to keep history linear and bisectable. The squash commit message references the issue number. | Branch protection enforces squash merge only (no merge commits, no rebase). After merge, the branch is deleted. |

- *CI Gate:* The CI workflow (`.github/workflows/ci.yml`) is configured as a **required status check** on the `main` branch. A PR cannot be merged until all required checks pass.
- *Auto-close:* Using `Fixes #<N>` in the squash commit message automatically closes the linked issue on merge.

---

## 3. Testing & Deployment Pipeline Requirements

This section defines the CI/CD standards for all agents. The pipeline mirrors proven patterns from the Psynaptix project, adapted for Vellum Rift's **pnpm monorepo** and **Unity XR client**.

### 3.1 Package Manager Convention

All Node.js packages in this monorepo use **pnpm v9+** exclusively.

| Rule | Detail |
|---|---|
| Lockfile | `pnpm-lock.yaml` is the single source of truth for dependency resolution. Never commit `package-lock.json`, `yarn.lock`, or `npm-shrinkwrap.json`. |
| Install | Always use `pnpm install` (never `npm install`). In CI, use `pnpm install --frozen-lockfile` to guarantee reproducible builds. |
| Workspace commands | Use `pnpm -r --if-present <script>` to run a script across all packages, or `pnpm --filter @vellum-rift/<pkg> <script>` for a single package. |
| Root scripts | The root `package.json` exposes convenience scripts (`dev`, `build`, `lint`) that delegate via `pnpm -r`. CI should prefer these root-level scripts when possible. |

### 3.2 Continuous Integration (CI)

A GitHub Actions workflow (`.github/workflows/ci.yml`) must run on every push and pull request to `main`. It is configured as a **required status check** on the `main` branch — no PR can merge until it passes.

#### 3.2.1 Node.js Pipeline (pnpm packages)

| Step | Command | Scope |
|---|---|---|
| Setup | `pnpm setup` (install corepack, enable pnpm) + `pnpm install --frozen-lockfile` | All |
| Typecheck | `pnpm -r --if-present lint` (each package's `lint` script runs `tsc --noEmit`) | `backend/`, `webrtc-sfu/`, `web-dashboard/`, `launcher/` |
| Unit tests | `pnpm --filter @vellum-rift/backend test` | `backend/` (Vitest, node env) |
| Build | `pnpm build` (runs `pnpm -r --if-present build`) | All pnpm packages |

**Node version:** 20+ (as declared in root `package.json` engines). Use `actions/setup-node@v4` with `cache: 'pnpm'`.

#### 3.2.2 Unity Pipeline (`@agent-xr-unity`)

Unity builds are **not** Docker-based. They run via the Unity CLI in headless mode on a GitHub Actions runner with the Unity Hub and Editor pre-installed (or via the `game-ci/unity-builder` action).

| Step | Command / Action | Target Platforms |
|---|---|---|
| Install dependencies | `Unity -batchmode -nographics -projectPath "vr-client-unity/Vellum Rift" -executeMethod CI.InstallDependencies` | All |
| Run tests (EditMode) | `Unity -batchmode -nographics -projectPath "..." -runTests -testPlatform editmode -testResults unity-test-results.xml` | All |
| Build WebGL | `Unity -batchmode -nographics -projectPath "..." -executeMethod CI.BuildWebGL -quit` | `web build/` |
| Build Android (Quest) | `Unity -batchmode -nographics -projectPath "..." -executeMethod CI.BuildAndroid -quit` | `.apk` / `.aab` |
| Build Windows (SteamVR) | `Unity -batchmode -nographics -projectPath "..." -executeMethod CI.BuildWindows -quit` | `.exe` |

- Test results must be published as JUnit XML artifacts (`unity-test-results.xml`).
- Build artifacts (`.apk`, `.exe`, WebGL build) must be uploaded as GitHub Actions artifacts for manual QA or downstream deployment.
- A C# static class `CI` in `Assets/Scripts/Editor/CI.cs` must expose the `[MenuItem]` or public static methods referenced by `-executeMethod`.

#### 3.2.3 GitHub Repository Configuration (Enforcement)

The following repository settings must be configured on the Vellum-Rift GitHub repo to enforce Rule 4 (§2):

**Branch Protection Rules (`main`):**
| Setting | Value |
|---|---|
| Require pull request reviews before merging | ✅ Enabled — **1 approving review** minimum |
| Dismiss stale pull request approvals when new commits are pushed | ✅ Enabled |
| Require status checks to pass before merging | ✅ Enabled — `ci` (from `.github/workflows/ci.yml`) is required |
| Require branches to be up to date before merging | ✅ Enabled |
| Include administrators | ✅ Enabled (no one bypasses protection, including owners) |
| Allow force pushes | ❌ Disabled |
| Allow deletions | ❌ Disabled |
| Required conversation resolution before merging | ✅ Enabled — all review comments must be resolved |
| Merge button control | ✅ **Squash-merge only** (disable merge commits and rebase-merge) |

**PR Template:**
A `.github/pull_request_template.md` file must exist with the following structure:

```markdown
## Related Issue
Fixes #<issue-number>

## Summary
<!-- Brief description of what this PR does -->

## Changes
<!-- List key changes (code, tests, docs) -->

## Testing
<!-- How was this tested? Include commands, screenshots, or Unity build notes -->

## Checklist
- [ ] Unit / integration tests added or updated
- [ ] `pnpm -r --if-present lint` passes
- [ ] `pnpm --filter @vellum-rift/backend test` passes (if backend changed)
- [ ] Unity EditMode tests pass (if Unity changed)
- [ ] Documentation updated (if API / schema / architecture changed)
```

**Issue Templates:**
The `.github/ISSUE_TEMPLATE/` directory must contain templates for:
| Template | File | Purpose |
|---|---|---|
| Bug Report | `bug.md` | Reproducible bugs with steps, expected vs actual behavior |
| Feature Request | `feature.md` | New functionality with acceptance criteria |
| Task / Chores | `task.md` | Maintenance, refactoring, CI/CD work |

> **Agent responsibility:** `@agent-core-backend` owns the initial setup of branch protection rules and templates. These are configured via GitHub's web UI or the `gh api` CLI and committed to `.github/`.

### 3.3 Build & Container Publishing

Each Node.js service that runs as a long-lived process must have its own Dockerfile and be published to **GHCR** (`ghcr.io/jrustyhaner/vellum-rift-*`).

| Service | Image Name | Dockerfile Location |
|---|---|---|
| Backend API | `ghcr.io/jrustyhaner/vellum-rift/backend` | `backend/Dockerfile` |
| WebRTC SFU | `ghcr.io/jrustyhaner/vellum-rift/webrtc-sfu` | `webrtc-sfu/Dockerfile` |
| Web Dashboard (static) | `ghcr.io/jrustyhaner/vellum-rift/web-dashboard` | `web-dashboard/Dockerfile` |

#### Tagging Strategy

Every push to `main` and every semver tag produces immutable tags in GHCR:

| Tag | When Applied |
|---|---|
| `sha-<7-char>` | Every push to `main` (e.g., `sha-a1b2c3d`) |
| `latest` | Only on pushes to `main` |
| `v<major>.<minor>.<patch>` | On Git tags matching `v*` (e.g., `v0.1.0`) |

The build-and-publish workflow (`.github/workflows/build-publish.yml`) must:
1. Use `docker/setup-buildx-action@v3` and `docker/login-action@v3`.
2. Authenticate to GHCR with `${{ secrets.GITHUB_TOKEN }}`.
3. Use `docker/metadata-action@v5` to generate tags from the table above.
4. Pass build args: `VERSION`, `COMMIT_SHA`, `BUILD_DATE`.

#### Dockerfile Standards (Node.js services)

All service Dockerfiles must follow a **two-stage build** pattern using `node:20-alpine`:

```dockerfile
# Stage 1: Install & build
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
COPY backend/package.json ./backend/
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @vellum-rift/backend build

# Stage 2: Runtime
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

> **Note:** The exact `COPY` strategy depends on whether the service uses shared workspace dependencies. Adjust accordingly — the key requirement is a minimal runtime image that does not include source code, devDependencies, or build tooling.

### 3.4 Health Endpoints

Every long-lived Node.js service must expose an unauthenticated health endpoint for orchestrator liveness probes.

| Service | Endpoint | Response |
|---|---|---|
| Backend API | `GET /health` | `{ "status": "ok", "uptime": <seconds> }` |
| WebRTC SFU | `GET /health` | `{ "status": "ok", "uptime": <seconds> }` |

- The health endpoint must be **unauthenticated** (used by Docker/Kubernetes liveness probes).
- A detailed health endpoint (`GET /health/detail`) may be added behind admin token auth for operational diagnostics (active sessions, connected peers, memory usage, etc.).

### 3.5 Rollback Strategy

Every push to `main` produces an immutable `sha-<short>` tag in GHCR. To roll back:

```sh
# List available tags:
gh cr list-tags ghcr.io/jrustyhaner/vellum-rift/backend

# Pull a known-good version:
docker pull ghcr.io/jrustyhaner/vellum-rift/backend:sha-a1b2c3d

# Restart the service with the pinned image (update docker-compose or k8s deployment)
```

- **Never** pin `latest` in production. Always use `sha-<short>` or semver tags.
- The `docker-compose.yml` files should reference images by tag, not by `latest`.

### 3.6 TLS & Reverse Proxy

TLS must be terminated at a reverse proxy (Caddy, nginx, or Traefik) in front of the services. Services bind to loopback (`127.0.0.1`) in production and trust the proxy via an environment flag:

```env
TRUST_PROXY=true
HOST=127.0.0.1
```

### 3.7 Agent Pipeline Responsibilities

| Agent | CI Ownership | Build / Publish Ownership |
|---|---|---|
| `@agent-core-backend` | Backend + WebRTC SFU CI jobs (typecheck, test, build) | Dockerfiles for `backend/` and `webrtc-sfu/`; health endpoints; GHCR publish workflow |
| `@agent-xr-unity` | Unity CI job (EditMode tests, platform builds) | `Assets/Scripts/Editor/CI.cs` build methods; artifact upload; no Docker involvement |
| `@agent-web-dashboard` | Dashboard + Launcher CI jobs (typecheck, build) | Dockerfile for `web-dashboard/`; E2E test suite (Playwright); GHCR publish workflow |

### 3.8 End-to-End Testing (Future)

When the full stack is reachable in a single environment, an E2E test suite using **Playwright** should be added:

| Command | Scope |
|---|---|
| `pnpm test:e2e` | Playwright tests against a live docker-compose stack |
| `pnpm test:e2e:local` | Playwright tests against locally running services (dev mode) |

E2E tests are **not** required for initial CI green — they run in a separate workflow (`.github/workflows/e2e.yml`) triggered on demand or nightly.