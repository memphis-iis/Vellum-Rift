# Backlog Governance

This document defines how Vellum Rift should grow from an initial seed backlog into milestone-ready sprint planning without losing traceability.

## Backlog Layers

### Milestones

Milestones define delivery outcomes, not task lists. Each milestone should have a clear product goal, entry criteria, and exit criteria.

### Epics

Epics group related behavior by user outcome or system capability. Examples include ingestion, exploration, shared sessions, communication, and spatial authoring.

### User Stories

User stories should describe a single user outcome small enough to estimate and test.

### Technical Enablers

Technical work without immediate user value should still be tracked, but clearly marked as an enabler tied to one or more stories.

## Story Quality Rules

Every story should:

1. identify the actor clearly
2. describe the user outcome rather than the implementation only
3. include acceptance criteria that can be validated
4. list dependencies when blocked by architecture or design decisions
5. avoid combining multiple platforms or failure modes if that makes the story untestable

## Splitting Rules

Split stories further when any of the following is true:

- web and VR behavior differ meaningfully
- happy path and failure path are both substantial
- persistence and realtime behavior need separate validation
- backend and client work can ship independently
- moderation, permissions, or export rules materially change scope

## Suggested ID Convention

- `VR-###` for product stories
- `EN-###` for technical enablers
- `RFC-###` for architecture decisions requiring approval before implementation

## Definition Of Ready

A story is ready when:

- product intent is understood
- acceptance criteria are specific enough to test
- dependencies are known
- design or architecture questions blocking implementation are identified
- the story fits within a sprint without hidden decomposition work

## Definition Of Done

A story is done when:

- implementation is complete
- acceptance criteria are validated
- documentation is updated where system behavior changed
- telemetry, moderation, and permissions impacts were considered where relevant
- QA notes or demo steps are recorded

## Expansion Plan Toward 300 Stories

To scale the backlog toward a few hundred stories, expand each epic across:

- platform slices
- permission slices
- realtime versus persisted behavior
- accessibility slices
- failure and recovery paths
- analytics and operations
- performance and release readiness

## Review Cadence

- refine milestones at the end of each sprint
- refine epics weekly during active discovery
- rewrite or split stories before sprint commitment rather than during sprint execution