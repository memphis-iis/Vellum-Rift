# Vellum Rift

Vellum Rift is a collaborative manuscript exploration platform spanning Web, Meta Quest, and SteamVR. It combines an existing document and annotation backend with new immersive exploration tooling so teams can upload manuscripts, preprocess them into web-friendly 3D assets, and explore them together in real time.

## Current Product Direction

- Source documents: TIFF, JPEG, and PDF.
- Delivery targets: hosted web client, Meta Quest store build, and Steam distribution for PCVR.
- Core interaction: users fly through manuscript-derived spatial data using desktop or XR controls.
- Collaboration: radar, text chat, spatial voice chat, summon-to-lead behavior, persistent pins, and collaborative drawing.
- Data pipeline: uploaded files are preprocessed asynchronously into web-friendly formats, and users can either wait for an invite or enter while the session populates.

## Documentation Map

- Current project status: [CURRENT-STATUS.md](CURRENT-STATUS.md)
- Developer onboarding: [ONBOARDING.md](ONBOARDING.md)
- Product summary: [docs/product-summary.md](docs/product-summary.md)
- Documentation index: [docs/README.md](docs/README.md)
- Architecture decisions: [docs/architecture](docs/architecture)
- Agile planning: [docs/agile](docs/agile)
- Onboarding: [docs/dev-onboarding](docs/dev-onboarding)

## Local Infra Quickstart

```bash
corepack enable
pnpm install
pnpm onboard
```

For the speech stack too:

```bash
corepack enable
pnpm onboard:speech
```

Windows PowerShell alternative:

```powershell
corepack enable
pnpm install
powershell -ExecutionPolicy Bypass -File .\scripts\onboard-all.ps1
```

Useful local endpoints:

- Hasura: `http://localhost:8080`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`
- Adminer: `http://localhost:8081`
- Dashboard dev server: `http://localhost:5173`

The backend onboarding flow is documented in [docs/dev-onboarding/backend-setup.md](docs/dev-onboarding/backend-setup.md). Dashboard setup is documented in [docs/dev-onboarding/dashboard-setup.md](docs/dev-onboarding/dashboard-setup.md). Cross-platform workspace setup is documented in [docs/dev-onboarding/workspace-setup.md](docs/dev-onboarding/workspace-setup.md).

## Repository Guidance

This repository should treat documentation, design decisions, backlog items, and implementation artifacts as versioned project assets. Major technical changes should update code and the relevant documentation in the same change set.

The current state of the repository is an early project-start foundation intended to help the team ideate and align, not a claim that implementation ownership or production delivery is already settled.

The current root repository tracks the monorepo scaffold, docs, backend, SFU, dashboard, infra support, and the Unity VR client under `vr-client-unity/`.

