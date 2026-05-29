# Accessibility And EULA Compliance

## Purpose

Vellum Rift builds on GlyphWitch account and EULA flows while adding immersive and audio-heavy collaboration features. This document defines how EULA enforcement and accessibility requirements should appear in the product architecture.

## EULA Enforcement Lifecycle

The existing EULA endpoints in GlyphWitch are the baseline enforcement mechanism.

Expected flow:

1. client authenticates or restores session context
2. client checks current EULA acceptance status before room entry
3. if acceptance is missing or outdated, room interaction is blocked
4. the client presents the required EULA UI and submits acceptance
5. room connection or session entry proceeds only after success

Applicable clients:

- hosted web client
- Quest client
- SteamVR client

Where institutional policy overrides exist for retention or export behavior, those differences should be reflected in user-facing legal or policy disclosures alongside the standard EULA flow.

## UX Expectations For Enforcement

- EULA gating must block interaction, not merely warn
- the user should be able to read the current EULA version clearly
- acceptance state should survive across ordinary sessions according to backend policy
- failures to verify acceptance should fail closed rather than silently permitting room entry

## Accessibility Baseline

Vellum Rift should treat accessibility as a product requirement, not a follow-up enhancement.

Key areas:

- speech-to-text support for spoken collaboration
- text-to-speech support for written chat
- readable UI in web and VR contexts
- input alternatives where feasible
- clear status feedback for warnings, processing, and session transitions

## Speech Accessibility Mapping

The speech bridge helps close collaboration gaps between keyboard-equipped web users and headset-first VR users.

For the current product direction, these speech capabilities are expected to run on self-hosted STT and TTS services rather than third-party hosted APIs.

The default first-release target is Faster-Whisper for STT and Piper for TTS.

Expected requirements:

- spoken communication can be surfaced as readable text
- written text can be surfaced as audible output
- transcript visibility and playback should be controllable by the user
- speech features should integrate with the product's privacy and retention rules
- transcripts should be treated as retained session history until the session is deleted unless stricter institutional policy applies

## Compliance Direction

The product should be documented in a way that supports VPAT or Section 508 style review, especially for research or institutional use.

Minimum expectations for documentation and implementation:

- identify major user interaction modes
- identify accommodations built into the architecture
- record known accessibility gaps explicitly
- test accessibility-related flows as part of release readiness, not only post-release

## Follow-Up Work

1. document failure modes and fallback behavior for Faster-Whisper and Piper
2. define VR-specific readable text and caption presentation rules
3. define known non-compliant areas if any remain at MVP
4. define EULA update and re-acceptance semantics across clients