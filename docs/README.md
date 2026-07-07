# Documentation Index

This directory is the source of truth for product, architecture, delivery planning, and onboarding.

## Structure

- `product-summary.md`: current scope, major decisions, and unresolved questions.
- `architecture/`: system design documents and engineering boundaries.
- `agile/`: milestones, story-writing standards, and initial backlog.
- `security/`: security architecture, trust boundaries, encryption, and auth handling.
- `operations/`: CI/CD, deployment, and runtime operations guidance.
- `qa/`: test strategy, harnesses, and validation scenarios.
- `compliance/`: EULA, accessibility, and policy-oriented engineering guidance.
- `governance/`: policy, provenance, contribution guardrails, and IP rules.
- `dev-onboarding/`: setup instructions by discipline.
- `reference/`: stable references copied or distilled from implementation surfaces.
- `art/`: concept notes and art-direction documents.

## Working Rules

1. Update architecture docs before or alongside changes that alter system shape.
2. Update agile docs when scope, milestones, or acceptance criteria change.
3. Keep implementation references tied to real files, routes, migrations, or schemas.
4. Prefer short RFC-style documents over large undifferentiated notes.

## Current Priority Docs

- [../CURRENT-STATUS.md](../CURRENT-STATUS.md)
- [../ONBOARDING.md](../ONBOARDING.md)
- [product-summary.md](product-summary.md)
- [architecture/agents.md](architecture/agents.md)
- [architecture/001-webrtc-sfu.md](architecture/001-webrtc-sfu.md)
- [architecture/002-hasura-sync.md](architecture/002-hasura-sync.md)
- [architecture/003-shader-pipeline.md](architecture/003-shader-pipeline.md)
- [architecture/005-data-ingestion-pipelines.md](architecture/005-data-ingestion-pipelines.md)
- [architecture/adr-001-webrtc-data-channel-stroke-streaming.md](architecture/adr-001-webrtc-data-channel-stroke-streaming.md)
- [agile/milestones.md](agile/milestones.md)
- [agile/backlog-governance.md](agile/backlog-governance.md)
- [agile/ideation-week-template.md](agile/ideation-week-template.md)
- [agile/user-stories.md](agile/user-stories.md)
- [security/zero-trust-telemetry.md](security/zero-trust-telemetry.md)
- [operations/ci-cd-matrix-deploy.md](operations/ci-cd-matrix-deploy.md)
- [qa/test-harness-crossplay.md](qa/test-harness-crossplay.md)
- [compliance/accessibility-and-eula.md](compliance/accessibility-and-eula.md)
- [governance/data-governance-and-provenance.md](governance/data-governance-and-provenance.md)
- [governance/contribution-and-agent-rules.md](governance/contribution-and-agent-rules.md)
- [governance/open-source-and-ip-policy.md](governance/open-source-and-ip-policy.md)
- [governance/platform-moderation-and-ethics.md](governance/platform-moderation-and-ethics.md)
- [dev-onboarding/backend-setup.md](dev-onboarding/backend-setup.md)
- [dev-onboarding/dashboard-setup.md](dev-onboarding/dashboard-setup.md)
- [dev-onboarding/workspace-setup.md](dev-onboarding/workspace-setup.md)
- [dev-onboarding/unity-setup.md](dev-onboarding/unity-setup.md)
- [reference/glossary.md](reference/glossary.md)
- [reference/backend-integration-summary.md](reference/backend-integration-summary.md)
- [reference/GlyphWitchAPI.md](reference/GlyphWitchAPI.md)
- [reference/authentication.md](reference/authentication.md)

## Local Development Files

- [../docker-compose.yml](../docker-compose.yml)
- [../docker-compose.tools.yml](../docker-compose.tools.yml)
- [../docker-compose.speech.yml](../docker-compose.speech.yml)
- [../Makefile](../Makefile)
- [../.env.example](../.env.example)