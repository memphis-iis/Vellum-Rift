# Contribution Rules And Agent Guardrails

## Purpose

Vellum Rift is a polyglot repository with a shared backend, realtime services, Unity clients, and planning artifacts. This document defines merge rules, database authority, and review boundaries.

## Continuous Integration Gates

The main branch should be protected by a multi-target build and validation matrix.

Required behavior:

- if any required compilation or validation target fails, the pull request cannot merge
- fixes for one target must not knowingly break another required target
- Web, backend, database, and supported Unity targets are all part of the protected surface

## Review Separation

- no engineer or automated agent may self-approve their own substantive code contribution
- every pull request requires at least one independent human review before merge
- architecture-affecting changes should reference the relevant design document in the review

## Database Migration Authority

Database schemas remain the source of truth for durable shared state.

Rules:

- migrations under `backend/migrations/` require developer-lead approval
- frontend-only changes must not silently redefine durable data contracts
- automated agents should not apply production schema changes autonomously
- production migrations should be executed only through approved deployment workflows

## Documentation Coupling

- changes that alter architecture, policy, or user-visible system behavior should update the related docs in the same change set
- governance docs should be updated when merge rules, retention policy, or moderation policy changes

## Commit And Approval Integrity

- protected branches should require status checks and review completion
- verified commits or equivalent provenance checks are preferred for release-critical changes
- emergency changes should be documented after the fact with explicit incident linkage