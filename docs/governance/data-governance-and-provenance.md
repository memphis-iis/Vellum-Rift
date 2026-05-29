# Data Governance, Retention, And Provenance

## Purpose

Vellum Rift handles manuscript uploads, optimized 3D derivatives, user-authored spatial artifacts, and deterministic analytical outputs. This document defines data retention, provenance, deletion, and privacy rules.

## Manuscript Ingestion Retention Lifecycle

To reduce storage risk and operating cost, raw archival inputs should have a default 30-day retention boundary unless a narrower contractual requirement applies. Institutional tenants may define approved override policies where governance or preservation requirements differ.

Lifecycle:

1. a raw `.tiff`, `.jpeg`, or `.pdf` enters the platform through the GlyphWitch upload flow
2. the source file is stored in encrypted durable object storage
3. asynchronous workers extract channels, traces, and optimized exploration derivatives
4. thirty days after initial upload, the raw source is permanently purged through a scheduled lifecycle process
5. optimized, web-friendly derivatives may remain according to product and institutional policy

If an institutional override exists, the lifecycle scheduler should apply the tenant-specific retention policy instead of the global default while keeping the policy explicit and auditable.

## Privacy By Design

Vellum Rift should avoid collecting more user telemetry than needed to deliver collaboration and safety features.

The system should not collect or retain by default:

- biometric signals
- gaze vectors for analytics
- hover heatmaps
- fine-grained behavioral surveillance beyond operational need

## Account Deletion And Erasure

When a user invokes account deletion through the existing GlyphWitch account flow, personal identity data should be purged or anonymized according to platform policy.

Minimum deletion expectations:

- remove or anonymize account-linked profile and authentication artifacts
- remove or anonymize chat records where legally and operationally appropriate
- preserve research geometry only if it can be decoupled from personal identifiers cleanly

For user-authored 3D strokes and other spatial artifacts, the preferred model is to retain research-value geometry while removing personal attribution where policy allows.

## Deterministic Bot Provenance

The document analysis bot is treated as deterministic analytical software, not an open-ended generative assistant.

Governance implications:

- replies must be traceable to stored dictionaries, theories, or formal parsing logic
- outputs should display provenance tags or equivalent source labels
- exported reports should preserve deterministic provenance language

## Default Export Policy

By default, session export should include research artifacts and derived collaboration data that do not expose personally identifiable information about users.

Default-exportable data classes:

- pins
- save points
- completed strokes
- deterministic analysis outputs with provenance
- non-PII session metadata needed to interpret exported artifacts

Data classes that should be excluded or institution-configurable due to personal data concerns:

- user identifiers beyond the minimum needed for audit or ownership policy
- account profile details
- authentication artifacts
- any transcript or chat content that contains personally identifiable information unless policy explicitly allows it

## GDPR And Similar Privacy Regimes

The platform should be documented to support data-subject rights workflows where applicable, including:

- access to retained personal data
- deletion or anonymization of personal identity fields
- clear retention windows for raw uploads and transcripts
- differentiation between personal data and retained research artifacts

## Transcript Retention Policy

Speech-to-text output used for accessibility and collaboration is retained as part of session history until the session is deleted, subject to future policy refinement for institutional deployments.

Implications:

- transcript retention should be documented as persisted session data rather than ephemeral debug telemetry
- transcript access must follow the same document and session authorization boundaries as related chat or collaboration artifacts
- transcript export behavior must be explicit in session export features rather than implicit

## Open Questions

1. which artifacts are legally treated as personal versus institutional research data
2. which institutional roles are authorized to approve retention overrides
3. which institutional roles are authorized to change export policy