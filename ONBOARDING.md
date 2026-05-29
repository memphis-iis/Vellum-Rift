# Developer Onboarding

This is the primary onboarding document for developers working in the Vellum Rift repository. It is intended to get a new contributor from clone to a usable local environment on Windows, Linux, or macOS.

For detailed subsystem instructions, continue into the documents linked throughout this guide.

## What This Repository Contains

Vellum Rift combines several workstreams in one repository:

- a TypeScript backend scaffold in `backend/`
- a WebRTC SFU scaffold in `webrtc-sfu/`
- a Vite and React dashboard in `web-dashboard/`
- local infrastructure definitions in `docker-compose*.yml`
- self-hosted speech-service scaffolding under `infra/speech/`
- the Unity project under `vr-client-unity/Vellum Rift`
- product, architecture, governance, QA, and onboarding docs under `docs/`

The current repository is documentation-heavy and implementation-light in some areas. The backend and SFU packages are scaffolded so local commands work now, while deeper application logic can be added incrementally.

For a plain statement of project maturity, see [CURRENT-STATUS.md](CURRENT-STATUS.md).

## First Principles

Before making changes:

1. treat GlyphWitch integration as the baseline document, auth, permissions, and chat model
2. keep durable shared state in PostgreSQL-backed services
3. keep high-frequency realtime behavior in the WebRTC lane, not the primary REST path
4. update docs when architecture, policy, or workflow changes

## Required Tools

Install these before onboarding:

- Git
- Git LFS
- Node.js 20 or later
- Docker with Compose support
- Unity Hub and the Unity editor version required by the project in `vr-client-unity/Vellum Rift`

Recommended:

- `corepack` enabled so `pnpm` works without a separate global install
- VS Code or another editor that handles TypeScript, YAML, Markdown, and Unity-friendly workflows well

## Repository Layout

Top-level directories and files you will use most often:

- `README.md`: short project overview and quickstart
- `ONBOARDING.md`: this guide
- `package.json`: root workspace scripts
- `docker-compose.yml`: core local infrastructure
- `docker-compose.tools.yml`: Mailpit and Adminer
- `docker-compose.speech.yml`: Faster-Whisper and Piper service scaffolding
- `backend/`: backend package scaffold
- `webrtc-sfu/`: SFU package scaffold
- `web-dashboard/`: hosted web dashboard package
- `vr-client-unity/Vellum Rift`: Unity client project
- `docs/`: documentation source of truth

## Cross-Platform Quickstart

### Any OS

```bash
git lfs install
git clone <your-repository-url>
cd Vellum-Rift
corepack enable
pnpm install
pnpm onboard
```

If you also want the local speech stack:

```bash
pnpm onboard:speech
```

### Windows PowerShell

```powershell
git lfs install
git clone <your-repository-url>
cd Vellum-Rift
corepack enable
pnpm install
powershell -ExecutionPolicy Bypass -File .\scripts\onboard-all.ps1
```

With speech services:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\onboard-all.ps1 -WithSpeech
```

### Linux Or macOS

```bash
git lfs install
git clone <your-repository-url>
cd Vellum-Rift
corepack enable
pnpm install
node ./scripts/onboard-all.mjs
```

With speech services:

```bash
node ./scripts/onboard-all.mjs --with-speech
```

## What The Onboarding Commands Do

The onboarding flow:

1. creates local `.env` files from the checked-in examples
2. merges newly added env keys into existing local env files
3. starts the core infrastructure stack
4. starts optional tooling services
5. optionally starts the speech-service stack

The local env files created and maintained by the setup process are:

- `.env`
- `backend/.env`
- `webrtc-sfu/.env`

## Local Services

After `pnpm onboard`, these local endpoints should be available:

- Hasura: `http://localhost:8080`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`
- Adminer: `http://localhost:8081`
- Vite dashboard, after `pnpm dev`: `http://localhost:5173`

After `pnpm onboard:speech`, these should also be available:

- Faster-Whisper: `http://localhost:10300/healthz`
- Piper: `http://localhost:10400/healthz`

## Start The Development Processes

Once onboarding is complete:

```bash
pnpm dev
```

That starts the backend and SFU scaffold processes together.

Current expected app endpoints:

- backend health: `http://localhost:4000/api/health`
- SFU health: `http://localhost:4100/health`
- dashboard: `http://localhost:5173`

## How To Use This Repo During Ideation Week

If the team is using this repository mainly to ideate while implementation is still early, use it as a shared context hub rather than treating every scaffold like a finished subsystem.

Recommended approach for the week:

1. Read [CURRENT-STATUS.md](CURRENT-STATUS.md) first so everyone starts with the same maturity assumptions.
2. Read [docs/product-summary.md](docs/product-summary.md) and [docs/reference/glossary.md](docs/reference/glossary.md) before proposing changes to terminology or scope.
3. Use [docs/agile/ideation-week-template.md](docs/agile/ideation-week-template.md) for longer notes or workshop outputs.
4. Use GitHub issues to capture discrete ideas, open questions, and risks.
5. Prefer clarity over completeness. It is acceptable to leave some ideas as well-framed questions.

Good outputs for the week:

- clarified vocabulary
- backlog candidates
- architecture questions
- risks worth tracking
- product assumptions worth validating

Less useful outputs:

- pretending scaffolds are production-ready
- silently changing shared terminology without updating docs
- burying important questions in chat instead of documenting them

## Open The Unity Project

Open this folder in Unity Hub:

- `vr-client-unity/Vellum Rift`

This is the active Unity project location already present in the repository.

## Useful Commands

Workspace commands:

```bash
pnpm setup:env
pnpm onboard
pnpm onboard:speech
pnpm dev
pnpm lint
pnpm build
pnpm migrate
```

Infrastructure commands:

```bash
pnpm infra:ps
pnpm infra:logs
pnpm infra:down
pnpm tools:up
pnpm tools:down
pnpm tools:logs
pnpm speech:up
pnpm speech:down
pnpm speech:logs
```

Make targets are also available if you prefer them for infrastructure work:

```bash
make init-env
make infra-up
make tools-up
make speech-up
```

## Discipline-Based Starting Points

The team has not assigned formal roles yet. The sections below are orientation aids for ideation and self-directed exploration, not an org chart.

### Backend Developers

Start here:

- `backend/`
- `webrtc-sfu/`
- [docs/dev-onboarding/backend-setup.md](docs/dev-onboarding/backend-setup.md)
- [docs/reference/backend-integration-summary.md](docs/reference/backend-integration-summary.md)

### XR And Unity Developers

Start here:

- `vr-client-unity/Vellum Rift`
- [docs/dev-onboarding/unity-setup.md](docs/dev-onboarding/unity-setup.md)
- [docs/architecture/003-shader-pipeline.md](docs/architecture/003-shader-pipeline.md)
- [docs/architecture/adr-001-webrtc-data-channel-stroke-streaming.md](docs/architecture/adr-001-webrtc-data-channel-stroke-streaming.md)

### Product, Design, And Planning Contributors

Start here:

- [docs/product-summary.md](docs/product-summary.md)
- [docs/agile/milestones.md](docs/agile/milestones.md)
- [docs/agile/user-stories.md](docs/agile/user-stories.md)
- [docs/README.md](docs/README.md)

### Frontend Developers

Start here:

- `web-dashboard/`
- [docs/dev-onboarding/dashboard-setup.md](docs/dev-onboarding/dashboard-setup.md)
- [docs/dev-onboarding/workspace-setup.md](docs/dev-onboarding/workspace-setup.md)
- [docs/product-summary.md](docs/product-summary.md)

## Current Implementation Caveats

- the backend and SFU are scaffolds, not full production services yet
- the dashboard is scaffolded as a Vite and React shell rather than a production-complete application
- `pnpm migrate` is still a placeholder until the real migration implementation is committed
- the Piper service is scaffolded for orchestration but not yet fully wired for synthesis
- the local speech stack is sufficient for environment setup, not final production model serving

## Troubleshooting

### `pnpm` Not Found

Run:

```bash
corepack enable
```

Then retry your `pnpm` command.

### Docker Compose Variable Warnings

Run:

```bash
pnpm setup:env
```

This refreshes local `.env` files with any newly added variables.

### A Port Is Already In Use

Review your local `.env` file and change the conflicting port, then rerun the relevant `pnpm ...:up` command.

### You Need To Reset Local Infra State

Run:

```bash
make infra-reset
```

Use this carefully because it drops local Docker volumes for the core infra stack.

## Documentation Map

The most important follow-on docs are:

- [docs/agile/ideation-week-template.md](docs/agile/ideation-week-template.md)
- [docs/dev-onboarding/workspace-setup.md](docs/dev-onboarding/workspace-setup.md)
- [docs/dev-onboarding/backend-setup.md](docs/dev-onboarding/backend-setup.md)
- [docs/dev-onboarding/dashboard-setup.md](docs/dev-onboarding/dashboard-setup.md)
- [docs/dev-onboarding/unity-setup.md](docs/dev-onboarding/unity-setup.md)
- [docs/product-summary.md](docs/product-summary.md)
- [docs/reference/glossary.md](docs/reference/glossary.md)
- [docs/architecture](docs/architecture)
- [docs/governance](docs/governance)

## Next Steps For A New Developer

1. Complete the quickstart and confirm all local services are reachable.
2. Run `pnpm lint` and `pnpm build` successfully.
3. Open the Unity project and verify it loads.
4. Read the role-specific onboarding docs for your area.
5. Pick a small task and update code plus docs together.
