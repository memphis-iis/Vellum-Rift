# Platform Moderation And Deterministic Bot Accountability

## Purpose

Vellum Rift includes collaboration, moderation, and automated analysis surfaces that must be governed for academic trust and operational clarity.

## Localized Ban Lifecycle

Moderation should be scoped as narrowly as practical unless broader enforcement is explicitly justified.

Current direction:

- document or session-level bans are preferred over platform-wide bans by default
- a user removed from one manuscript space is not automatically blocked from unrelated spaces unless separate policy or repeated abuse justifies it
- moderation actions should remain auditable through existing backend records where possible

## Deterministic Bot Accountability

The document analysis bot exposed through the document chat surface is treated as a deterministic analyzer rather than a probabilistic generative assistant.

Implications:

- outputs should be assembled from verified stored data or deterministic parsing logic
- the interface should clearly label the output as deterministic analytical output
- provenance tags should identify the source table, record, or algorithmic basis for the response

## Reliability And Transparency Rules

- deterministic output should not be presented as open-ended scholarly truth beyond its source material
- exported reports and chat-derived analyses should preserve provenance language
- if the bot cannot ground an answer in verified data, it should fail transparently rather than improvise

## Ethical Boundary

The system should support research and interpretation without overstating certainty. Features that infer meaning from incomplete manuscript evidence should distinguish between:

- verified stored data
- user theories or interpretations
- deterministic derived outputs from known rules

## Follow-Up Work

1. define the exact provenance tag format for bot and export surfaces
2. define failure messaging when deterministic analysis cannot produce an answer
3. define when moderation escalates from document-local to broader enforcement