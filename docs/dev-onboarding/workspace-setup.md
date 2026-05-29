# Workspace Setup

This document is the cross-platform starting point for contributors working on the Vellum Rift repository across Windows, Linux, and macOS.

## Supported Local Tooling

- Node.js 20 or later
- pnpm 9 or later
- Docker Desktop or Docker Engine with Compose support
- Git with Git LFS
- Unity Hub plus the Unity editor version required by the project under `vr-client-unity/Vellum Rift`

## Recommended Cross-Platform Commands

### Any OS With Node And Docker

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

### Windows PowerShell

```powershell
corepack enable
pnpm install
powershell -ExecutionPolicy Bypass -File .\scripts\onboard-all.ps1
```

For the speech stack too:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\onboard-all.ps1 -WithSpeech
```

### Linux Or macOS

```bash
corepack enable
pnpm install
node ./scripts/onboard-all.mjs
```

For the speech stack too:

```bash
corepack enable
node ./scripts/onboard-all.mjs --with-speech
```

## Day-One Developer Workflow

1. Install root dependencies with `pnpm install`.
2. Start local infra with `pnpm onboard` or `pnpm onboard:speech`.
4. Start backend, SFU, and dashboard development processes with `pnpm dev`.
4. Open the Unity project at `vr-client-unity/Vellum Rift` in Unity Hub.

## Useful Commands

```bash
pnpm infra:ps
pnpm infra:logs
pnpm tools:logs
pnpm speech:logs
pnpm dashboard:dev
pnpm dashboard:build
pnpm build
pnpm lint
```

## Notes

- The backend and SFU packages are scaffolded so the workspace commands resolve now, even though full application logic is not committed yet.
- The Piper service is scaffolded for local orchestration, but model serving still needs to be implemented behind the HTTP endpoint.