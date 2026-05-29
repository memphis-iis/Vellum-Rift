# SDD 002: Persisted State Sync And Host Migration

## Context

Vellum Rift needs durable collaborative state that survives disconnects and can be queried, exported, and restored. That includes room membership, host authority, pins, save points, and completed strokes.

## Decision

Use PostgreSQL as the durable source of truth and Hasura or a comparable API layer for subscriptions, queries, and mutations over that data.

## Baseline From Existing System

The current backend already provides document, page, annotation, chat, team, and permission surfaces. Vellum Rift should extend that data model for spatial collaboration instead of creating a separate product database.

## Proposed Additions

### `vr_sessions`

Tracks a live collaborative session for a document or manuscript artifact.

Suggested fields:

- `id`
- `document_id`
- `current_host_id`
- `status`
- `summon_trigger_at`
- `summon_x`
- `summon_y`
- `summon_z`
- `created_at`
- `updated_at`

### `vr_session_participants`

Tracks active or recent participants and join-order information needed for host migration.

Suggested fields:

- `id`
- `session_id`
- `user_id`
- `joined_at`
- `last_seen_at`
- `current_x`
- `current_y`
- `current_z`
- `selected_palette`

### `vr_spatial_artifacts`

Represents durable spatial artifacts, including pins and save points as separate artifact types.

Suggested fields:

- `id`
- `session_id`
- `artifact_type`
- `label`
- `x`
- `y`
- `z`
- `created_by`
- `created_at`
- `updated_at`

Expected initial `artifact_type` values:

- `pin`
- `save_point`

## Host Migration Rule

If the current host disconnects or is considered inactive, authority transfers to the next eligible participant by ascending `joined_at` order.

## Local-Only State

Each user may choose their own palette or Z-axis interpretation. That preference may be stored for convenience but should not be enforced as shared room state.

## Current Direction

Save points should be treated as a separate artifact type rather than as ordinary pins. If they later need richer restoration logic or lifecycle rules, they can be promoted into a dedicated table without changing the initial product language.