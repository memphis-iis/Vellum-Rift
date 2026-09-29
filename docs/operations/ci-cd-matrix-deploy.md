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
[ Manual / dispatch Unity clients ]
  - EditMode tests: workflow_dispatch → unity-editmode-tests.yml
  - Quest APK: workflow_dispatch → unity-build-android.yml → artifact VellumRift-Quest-apk
  - WebGL museum: local `vr-client-unity/scripts/build-webgl-museum.sh`
                |
                v
[ Manual deploy / store packaging by maintainers ]
```

Workflows:

- `.github/workflows/ci.yml` — lint, backend tests, workspace build
- `.github/workflows/build-publish.yml` — GHCR images
- `.github/workflows/unity-editmode-tests.yml` — EditMode NUnit (requires `UNITY_LICENSE`)
- `.github/workflows/unity-build-android.yml` — Quest APK via `VellumRift.Editor.CIBuild.BuildAndroid` (requires `UNITY_LICENSE`)

All support `workflow_dispatch` for manual runs (Unity workflows are dispatch-only until license secrets are standard).

## 2. What CI Actually Enforces Today

Every pull request and push targeting **`main`** should run the `CI` workflow (`node-ci` job).

| Step | Command | Scope |
|------|---------|--------|
| Enable pnpm | `corepack enable` (before `setup-node` cache) | Runner |
| Install | `pnpm install --frozen-lockfile` | Workspace |
| Typecheck | `pnpm -r --if-present lint` | Packages with a `lint` script |
| Unit tests | `pnpm --filter @vellum-rift/backend test` | Backend (Vitest) |
| Build | `pnpm build` | All packages with `build` |

**Not required on every PR (dispatch / local):**

- Unity EditMode tests — `.github/workflows/unity-editmode-tests.yml` (`UNITY_LICENSE`)
- Headless Unity Android Quest APK — `.github/workflows/unity-build-android.yml` + local `vr-client-unity/scripts/build-android-quest.sh`
- Headless Unity WebGL — local `vr-client-unity/scripts/build-webgl-museum.sh` (`VellumRift.Editor.CIBuild.BuildWebGL`)
- Automatic production schema migrations

### Android / Quest APK

| Item | Value |
|------|--------|
| Entry | `VellumRift.Editor.CIBuild.BuildAndroid` |
| Local script | `vr-client-unity/scripts/build-android-quest.sh` |
| Default output | `vr-client-unity/Vellum Rift/build/VellumRift-Quest.apk` |
| CI artifact | `VellumRift-Quest-apk` from `unity-build-android.yml` |
| Target | ARM64, IL2CPP, min API 29, Vulkan + OpenGLES3 |
| Signing | Optional `ANDROID_KEYSTORE_*` env vars; otherwise debug-signed |

Unity WebGL compilation is **not** a required GitHub Actions check on every PR. Sideload steps live in `docs/qa/quest-museum-verify.md` (Step 6).

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

- Meta Quest APK can be produced via `workflow_dispatch` (`unity-build-android.yml`) or locally with `build-android-quest.sh`; store upload / signing remains a maintainer step.
- Steam / PCVR packages remain **manual**.

### Production Database Migration Policy

- Automated CD must not modify production PostgreSQL schemas.
- Migration SQL lives under `backend/src/migrations/` and is applied with `pnpm migrate` (see backend package scripts).
- Production runs require lead-engineer review and an explicit migration against the target database.

## 5. Branch And Review Expectations

- Default branch: **`main`** (not `master`).
- Prefer squash-merge; link issues with `Fixes #<n>`.
- Required CI should match `.github/workflows/ci.yml` (`node-ci`), not a fictional Unity WebGL gate.
