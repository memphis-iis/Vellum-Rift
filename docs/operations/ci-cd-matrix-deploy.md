# CI/CD Automation Matrix And Deployment Policy

## 1. Pipeline Overview

This document outlines the continuous integration and verification pipelines executed via GitHub Actions for the Vellum Rift monorepo. The automation pipeline acts as a protective quality gate to validate pull requests before manual deployment orchestration by `@JRustyHaner` or `@megageese`.

```text
[ Developer Pull Request ]
			|
			v
[ GitHub Actions Runner ] ---> Lint Workspace (ESLint / Prettier / C#)
			|
			v
[ Parallel Test Matrix ] ------+--> Test Express API & Typescript Shared Contracts
							   +--> Build Next.js / React Dashboard Artifacts
							   +--> Execute Headless Unity WebGL Compilation Pass
			|
			v
[ PR Merge Authorized ] -------> Manual Release Control by Lead Developers
```

## 2. Automated Testing And Compilation Matrix

Every pull request targeting the `master` branch triggers a parallel automation suite to verify code health across all components.

### Workspace Linting And Syntax Verification

- Express backend and React dashboard: the runner executes automated style verification and TypeScript compilation checks.
- Unity C# scripts: headless verification checks C# formatting and confirms there are no broken class references or unresolved assembly definitions before compilation begins.

### Express And React Dashboard Validation

- The pipeline spins up isolated test runners, installs project dependencies via `pnpm` workspaces, and executes all unit and integration tests.
- A test compilation pass is executed on the React dashboard to ensure the production-ready build output completes without bundling failures.

### Unity WebGL Compilation Pass

- Because Unity WebGL runs inside the browser dashboard sandbox, ensuring it compiles without platform errors is mandatory.
- The runner activates a headless instance using the temporary personal license configuration stored in GitHub Actions secrets.
- The WebGL gate: the pipeline executes a command-line build pass targeting the WebGL platform. If the WebGL compilation fails, the pull request is blocked from merging.

## 3. Deployment And Release Management Policy

### Application Dashboard Hosting

- Once a pull request passes all automated checks and is merged, the updated Express API server assets and the React static dashboard bundles are deployed to the hosting infrastructure.
- The newly compiled static WebGL build folder from Unity is injected directly into the React public asset hosting directory so browser clients can access the updated 3D workspace.

### Native Store Deployments

- Manual builds required: standalone Android packages for Meta Quest and Windows PCVR binaries are excluded from automated deployment pipelines.
- Compilation execution: `@JRustyHaner` and `@megageese` manually run native production compilation tasks in the local Unity development environment to sign, package, and upload binaries to the Oculus App Lab dashboard and Steamworks portal.

### Production Database Migration Policy

- Manual execution only: automated continuous deployment is barred from modifying production PostgreSQL schemas or running Hasura metadata updates.
- All migration scripts under `backend/migrations/` must be manually reviewed, validated against development environments, and executed by a lead engineer using an explicit migration command against the production database cluster.