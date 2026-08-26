# Product Summary

## Vision

Vellum Rift is a collaborative research environment for exploring ancient manuscripts as spatial data. Teams upload manuscript files to a remote service, wait for preprocessing or enter while data streams in, and then inspect document-derived 3D spaces together across Web and VR clients.

## Confirmed Product Decisions

### Platforms

- Hosted web experience with non-VR controls.
- Native VR delivery for Meta Quest.
- Native VR delivery for Steam / PCVR.

### Input Model

- Web: WASD, joystick, and mouse.
- VR: joystick locomotion with a jetpack button.

### File Intake And Processing

- Accepted source formats: TIFF, JPEG, PDF.
- Assets are preprocessed asynchronously on the server.
- Users may wait for an invite email or enter while the session is still populating.
- Processed output should use web-friendly formats.
- Raw upload retention defaults to 30 days, with institution-specific override policies allowed.

### Exploration Model

- The environment is scaled like a mountain range rather than a close-up tabletop.
- Users can explore color and contrast-driven interpretations of the same manuscript.
- Palette or Z-axis choices are local to each user rather than globally forced.

### Multiplayer And Collaboration

- Teams need radar, text chat, and spatial voice chat.
- Spatial voice should support both distance-based audio and a global radio mode.
- Session leads need a summon-team action.
- If the lead disconnects, authority should migrate by join order.
- Users can persist and later export session artifacts.

### Persistence And Authoring

- Pins persist as coordinates.
- Any team member can edit or delete pins.
- Session export is required.
- Session export should include any non-PII research artifacts by default.
- VR users should be able to create new strokes in 3D space.
- Desktop web users do not create new strokes in the MVP.
- The system should also work with documents and trace data from the existing manuscript application.

### Data And Sync Strategy

- Custom backend server for WebRTC.
- Hosted PostgreSQL for persisted state.
- Web-friendly assets shared across Web and VR clients.
- Speech-to-text and text-to-speech models are self-hosted rather than managed by a third-party API.
- The default first-release speech stack is Faster-Whisper for STT and Piper for TTS.

## Integration Baseline

**Current:** Vellum Rift APIs use Bluekey (when `AUTH_REQUIRED=true`) and Express + Postgres for durable session/document-processing surfaces. GlyphWitch document/team ACL and related platform reuse is **out of scope for now** — see [backend-integration-summary.md](reference/backend-integration-summary.md) and the historical [GlyphWitchAPI.md](reference/GlyphWitchAPI.md) inventory.

Future integration with GlyphWitch (or another manuscript platform) remains an open product decision, not a local onboarding prerequisite.

## Current Open Questions

1. Which institutional roles are allowed to change export policy or artifact visibility settings?