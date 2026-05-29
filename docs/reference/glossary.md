# Glossary

This glossary defines the current shared vocabulary for Vellum Rift. These definitions are intended to support ideation, planning, onboarding, and early implementation.

## Artifact

A durable object associated with a session or document-derived exploration space. In current planning, artifacts include items such as pins, save points, completed strokes, and exportable non-PII research outputs.

## Backend

The TypeScript application layer in `backend/` responsible for durable application behavior, integration with GlyphWitch concepts, and access to persistent data and workflow orchestration.

## Dashboard

The hosted browser-facing web application in `web-dashboard/`. It is intended to handle uploads, preprocessing status, session access, team and permission flows, and other non-VR control-surface tasks.

## Deterministic Bot

The document analysis bot exposed through the existing document chat surface. It is treated as a deterministic analysis tool grounded in stored data and formal logic rather than an unconstrained generative chatbot.

## Document

A manuscript or uploaded source object managed through the existing GlyphWitch-oriented document model. Documents are the baseline resource around which uploads, permissions, annotations, and sessions are organized.

## Export

A structured output package derived from session or document collaboration state. Current policy direction is that exports should include non-PII research artifacts by default.

## Faster-Whisper

The default first-release self-hosted speech-to-text stack currently planned for transcription.

## GlyphWitch

The existing manuscript-oriented backend and schema baseline that Vellum Rift is intended to extend. GlyphWitch already provides document, auth, permission, chat, annotation, and related collaboration surfaces.

## Hasura

The GraphQL and subscription layer over PostgreSQL used for durable state synchronization and query access.

## Host Migration

The rule by which session leadership transfers to another participant when the current lead disconnects. Current planning says this should follow join order.

## Jetpack

The VR locomotion action used to propel a participant through the manuscript-derived 3D space.

## MinIO

The S3-compatible local object storage service used in local development for manuscript-related asset storage.

## Palette

A user-local visual interpretation mode for rendering manuscript-derived data, such as red, green, blue, or contrast views. Palette changes are intended to be local rather than globally forced.

## Participant

A user currently present in a live session. Participants may have realtime location, audio, and session-state implications.

## Piper

The default first-release self-hosted text-to-speech stack currently planned for synthesis.

## Pin

A persistent coordinate-based marker placed in the spatial session. Pins are durable and can be exported as non-PII research artifacts.

## Save Point

A distinct artifact type used for navigation recovery, regrouping, or fallback teleport behavior. Save points are not treated as ordinary pins in current planning.

## Session

A live collaborative exploration instance tied to a manuscript or document-derived environment. Sessions may include participants, host authority, artifacts, chat, voice, and exportable research outputs.

## SFU

Selective Forwarding Unit. In Vellum Rift, this refers to the realtime media and data-plane service used for voice and high-frequency collaboration flows such as live stroke streaming.

## Spatial Voice

Voice communication whose volume or spatialization depends on the relative position of participants in the environment, with an optional global radio override.

## Speech Stack

The self-hosted speech services used for transcription and synthesis. Current planning targets Faster-Whisper for STT and Piper for TTS.

## Stroke

A user-authored drawn path in 3D space. Current planning says stroke creation is VR-only for the MVP.

## Summon Team

The host action that pulls or teleports other participants to the lead user's location for coordinated viewing.

## Trace

A source-derived or imported structural path associated with the manuscript data itself. Traces are distinct from user-authored strokes even when they are shown in the same environment.

## Unity Client

The XR-oriented client project under `vr-client-unity/Vellum Rift`, targeting Quest, SteamVR, and browser-linked experiences where applicable.

## WebRTC

The realtime transport layer used for latency-sensitive audio and data-channel behavior such as spatial voice and in-progress stroke streaming.

## Z-Axis Interpretation

The mapping of a manuscript-derived data dimension into perceived depth in the environment. Different users may choose different local interpretations such as color-channel or contrast-based depth views.
