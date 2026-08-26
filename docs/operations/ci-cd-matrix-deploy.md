# CI/CD Automation Matrix And Deployment Policy

## 1. Pipeline Overview

This document describes the GitHub Actions workflows that currently run for the Vellum Rift monorepo. Automation is a quality and publish gate; application deployment to test/production hosts remains manual (for example via `infra/deploy/iis-memphis/`).

```text
[ Push / PR to main  or  workflow_dispatch ]
                |
                v
[ CI: node-ci ]
  - corepack enable
  - pnpm install --frozen-lockfile
  - pnpm -r --if-present lint   (TypeScript check)
  - pnpm --filter @vellum-rift/backend test
  - pnpm build
                |
                v
[ Push to main / tag v*  or  workflow_dispatch ]
                |
                v
[ Build and Publish ]
  - Docker build + push to GHCR
      backend, webrtc-sfu, web-dashboard
                |
                v
[ Manual deploy / store packaging by maintainers ]
```

Workflows:

- `.github/workflows/ci.yml` — lint, backend tests, workspace build
- `.github/workflows/build-publish.yml` — GHCR images

Both support `workflow_dispatch` for manual runs.

## 2. What CI Actually Enforces Today

Every pull request and push targeting **`main`** should run the `CI` workflow (`node-ci` job).

| Step | Command | Scope |
|------|---------|--------|
| Enable pnpm | `corepack enable` (before `setup-node` cache) | Runner |
| Install | `pnpm install --frozen-lockfile` | Workspace |
| Typecheck | `pnpm -r --if-present lint` | Packages with a `lint` script |
| Unit tests | `pnpm --filter @vellum-rift/backend test` | Backend (Vitest) |
| Build | `pnpm build` | All packages with `build` |

**Not in CI today (planned / manual):**

- ESLint / Prettier as separate jobs (packages use `tsc --noEmit` via `lint`)
- Unity EditMode tests
- Headless Unity WebGL / Android / Windows builds
- Automatic production schema migrations

Unity WebGL compilation is **not** a required GitHub Actions check. Native and WebGL client builds are produced locally (or in a future Unity CI job tracked as IMPL-025b).

## 3. Container Publish (GHCR)

On push to `main`, version tags `v*`, or manual dispatch, `Build and Publish` builds and pushes:

| Service | Image | Dockerfile |
|---------|--------|------------|
| Backend API | `ghcr.io/memphis-iis/vellum-rift/backend` | `backend/Dockerfile` (repo-root context) |
| WebRTC SFU | `ghcr.io/memphis-iis/vellum-rift/webrtc-sfu` | `webrtc-sfu/Dockerfile` |
| Web Dashboard | `ghcr.io/memphis-iis/vellum-rift/web-dashboard` | `web-dashboard/Dockerfile` |

Image names are lowercased (`memphis-iis/vellum-rift/...`) because GHCR requires lowercase repositories.

Dashboard image serves the Vite production build via nginx. Backend uses `node:20-bookworm-slim` so native deps such as `canvas` can install from glibc prebuilds.

## 4. Deployment And Release Management Policy

### Application Hosting

- Merging to `main` does **not** auto-deploy application traffic.
- Test-platform deploy steps for IIS / ramiel are documented under `infra/deploy/iis-memphis/`.
- Embedding a Unity WebGL build into the dashboard public assets is a product/deploy step, not an automated CI injection today.

### Native Store Deployments

- Meta Quest and Steam / PCVR packages are **manual**.
- Maintainers build, sign, and upload from a local Unity environment when releasing store builds.

### Production Database Migration Policy

- Automated CD must not modify production PostgreSQL schemas.
- Migration SQL lives under `backend/src/migrations/` and is applied with `pnpm migrate` (see backend package scripts).
- Production runs require lead-engineer review and an explicit migration against the target database.

## 5. Branch And Review Expectations

- Default branch: **`main`** (not `master`).
- Prefer squash-merge; link issues with `Fixes #<n>`.
- Required CI should match `.github/workflows/ci.yml` (`node-ci`), not a fictional Unity WebGL gate.
