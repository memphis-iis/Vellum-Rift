# Backend And Preprocessing Environment Setup

This document outlines the local setup instructions for engineers working on the Express and TypeScript REST API, the WebRTC SFU server, and the asynchronous 3D document preprocessing pipeline.

## Core Prerequisites

- Node.js: v20.x or higher, preferably current LTS
- Package manager: `pnpm` or `npm` workspaces coordinated from the repository root
- Docker and Compose: required for local PostgreSQL, Hasura, and S3-compatible storage
- Git LFS: required before pulling large manuscript fixtures or design assets

## Step-By-Step Environment Initialization

### 1. Clone The Repository With Git LFS

Ensure Git Large File Storage is initialized before cloning if the repository includes tracked fixtures or binary artifacts.

```bash
git lfs install
git clone <your-repository-url>
cd Vellum-Rift
```

### 2. Install Workspace Dependencies

From the repository root, install workspace dependencies so local package scripts resolve on Windows, Linux, and macOS.

```bash
corepack enable
pnpm install
```

### 3. Initialize Local Environment Files

Copy the checked-in example environment files into local working copies.

```bash
pnpm setup:env
```

This creates:

- `.env`
- `backend/.env`
- `webrtc-sfu/.env`

### 4. Start Core Infrastructure

Bring up PostgreSQL, Hasura, MinIO, and the bucket bootstrap job.

```bash
pnpm infra:up
```

Optional local tools for email and SQL inspection:

```bash
pnpm tools:up
```

Optional self-hosted speech stack:

```bash
pnpm speech:up
```

Available local surfaces after startup:

- PostgreSQL: `localhost:5432`
- Hasura: `http://localhost:8080`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`
- Adminer: `http://localhost:8081`

### 5. Verify Running Services

```bash
pnpm infra:ps
docker compose --env-file .env -f docker-compose.yml logs --tail=50
```

### 6. Apply Database Migrations And Initial Schema

Apply the canonical database schema and follow-on migrations before starting backend development.

```bash
npm run migrate --prefix backend
```

This command is documented now and should be enabled once the backend migration tooling is committed. It should bring the environment from the base schema through the latest GlyphWitch migrations, and later Vellum Rift session extensions once those migrations are added.

### 7. Configure Local Environment Variables

The repository includes example environment files at the root, in `backend/`, and in `webrtc-sfu/`. Review and adjust them after running `pnpm setup:env`.

Root `.env` example:

```dotenv
POSTGRES_DB=vellum_rift
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
HASURA_GRAPHQL_ADMIN_SECRET=local_admin_secret_dev
S3_BUCKET_NAME=local-manuscript-cache
RAW_ASSET_TTL_DAYS=30
```

Add service-specific variables for:

- WebRTC signaling endpoints
- object storage credentials
- transcript retention configuration
- speech service endpoints for Faster-Whisper and Piper where applicable

### 8. Launch Backend Development Processes

Start the local development workflow that watches backend and realtime services together.

```bash
pnpm dev
```

Expected local surfaces:

- Express REST API on the configured local port such as `http://localhost:4000/api`
- GraphQL or Hasura development endpoint
- WebRTC signaling or SFU service endpoint
- optional speech service containers if the local stack includes them

## Day-One Commands

Most backend onboarding should reduce to these commands:

```bash
git lfs install
git clone <your-repository-url>
cd Vellum-Rift
corepack enable
pnpm install
pnpm onboard
```

Useful maintenance commands:

```bash
pnpm infra:logs
pnpm tools:logs
pnpm speech:logs
pnpm infra:down
pnpm tools:down
make infra-reset
```

## Working Conventions

1. Treat GlyphWitch document, auth, team, permission, and chat routes as the integration baseline.
2. Add schema changes through migrations rather than direct database edits.
3. Keep durable room state in PostgreSQL-backed services.
4. Keep high-frequency realtime traffic out of the primary REST request path.
5. Update the relevant architecture or governance doc when introducing a new durable workflow.

## Initial Backend Workstreams

- preprocessing hooks for uploaded manuscript assets
- session persistence and host migration support
- export surfaces for spatial session artifacts
- integration between REST, subscriptions, WebRTC signaling, and self-hosted speech services

## Documentation Requirements

If a backend change introduces a new table, route, event contract, processing worker, or retention policy, update the relevant documentation in the same change set.