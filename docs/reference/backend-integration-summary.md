# Backend Integration Summary

This document summarizes how Vellum Rift should build on GlyphWitch, the existing manuscript backend and database surfaces already present in the repository and prior API reference.

The detailed route and storage inventory lives in [GlyphWitchAPI.md](GlyphWitchAPI.md). This summary is intentionally narrower and focused on how Vellum Rift should reuse and extend that platform.

## Principle

Vellum Rift should extend the existing document collaboration platform, not replace it.

## Existing Domain Areas To Reuse

### Authentication And Account

Use the existing account, profile, token, passkey, and TOTP surfaces as the starting point for identity.

Relevant capabilities already exist for:

- registration and login
- refresh and revocation
- account profile and export
- deactivation and reactivation

### Documents And Uploads

Use the existing document and page flows as the intake boundary for manuscript uploads.

Relevant capabilities already exist for:

- document creation
- PDF and image upload
- upload progress
- page retrieval and save flows
- document ownership and deletion

### Annotations, Traces, Glyphs, And Corrections

Use the existing annotation and drawing model as the baseline for persisted traces and authored stroke data.

Relevant capabilities already exist for:

- document and page annotations
- annotation layers
- drawing annotations
- glyph grouping and grouping membership
- correction analytics

### Teams, Permissions, And Notifications

Use the existing team and permission model as the baseline for session access.

Relevant capabilities already exist for:

- team creation and invites
- team membership and role changes
- direct document permissions
- team-level document grants
- notifications

### Chat And Moderation

Use existing chat and moderation concepts where possible before inventing separate room-specific systems.

Relevant capabilities already exist for:

- document chat history
- bot chat route
- abuse reports
- flagged chat workflow
- bans and activity tracking

## New Domain Areas Vellum Rift Still Needs

The current platform does not yet fully describe spatial collaboration. New surfaces are still required for:

- live VR and web session lifecycle
- host authority and host migration
- summon-team behavior
- participant transforms and radar state
- spatial pins and save points
- completed collaborative stroke sessions mapped into 3D coordinates
- WebRTC signaling and low-latency presence transport

## Preferred Extension Strategy

1. Reuse existing user, team, document, and annotation identities.
2. Add new spatial tables and APIs only where the existing backend lacks a concept.
3. Keep document ownership and access control in the current permission model.
4. Avoid duplicating chat, notification, or audit capabilities unless immersive UX forces a distinct model.

## Confirmed Integration Decision

Milestone one reuses GlyphWitch authentication, teams, permissions, and chat as the authoritative collaboration model. Vellum Rift should add spatial session capabilities on top of that system rather than introducing a parallel identity or room-permission stack.