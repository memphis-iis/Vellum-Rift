# Zero Trust Telemetry And Realtime Security

## Purpose

Vellum Rift handles sensitive collaboration state, manuscript-derived artifacts, and realtime voice and drawing traffic across Web, Quest, and SteamVR clients. This document defines the security posture for transport, subscriptions, client token handling, and telemetry boundaries.

## Core Principles

1. trust no client by default
2. authorize every durable read and write against server-side policy
3. minimize sensitive data retained in clients and logs
4. separate ephemeral realtime traffic from durable collaboration state
5. encrypt all network transport paths

## Trust Boundaries

### Boundary A: Client Runtime

- Web client runs in a browser sandbox.
- Quest and SteamVR clients run in Unity runtime environments that may be physically accessible to end users.
- Clients are treated as potentially observable or recoverable by an attacker with device access.

### Boundary B: Realtime Media Plane

- WebRTC carries spatial voice and ephemeral drawing or movement packets.
- Realtime traffic must not be trusted as authoritative persisted state.

### Boundary C: Durable State Plane

- GlyphWitch authentication, document permissions, team membership, EULA state, and persisted spatial artifacts live in server-controlled systems.
- Durable state flows through PostgreSQL-backed APIs and subscription layers protected by row-level policy.

### Boundary D: Self-Hosted Speech Services

- Speech-to-text and text-to-speech run in self-hosted infrastructure controlled by the Vellum Rift platform.
- These services are trusted as internal processors, but should still be isolated from primary auth and persistence services.
- The default first-release speech stack is Faster-Whisper for transcription and Piper for synthesis.

## Data In Transit

### HTTPS And WSS

- All REST, GraphQL, and subscription traffic must use TLS-protected transport.
- Plain HTTP or unsecured WebSocket connections are not permitted outside isolated local development.

### WebRTC DTLS And SRTP

- WebRTC sessions must negotiate encrypted media and data channels using DTLS.
- Audio media must be transported with SRTP.
- Drawing and movement packets sent over data channels must remain inside the DTLS-protected session.
- The SFU must never downgrade media or data transport to plaintext.

### Signaling

- WebRTC signaling endpoints must require authenticated session context before issuing or accepting offers and answers.
- Signaling payloads should be short-lived and scoped to a specific room or session.

## Hasura And PostgreSQL Authorization

## Row-Level Security Objectives

Subscriptions, queries, and mutations for Vellum Rift must respect GlyphWitch document and team permissions before emitting state.

Minimum authorization checks:

- user belongs to a team with document access through `user_teams` and `document_teams`, or
- user has direct access through `document_permissions`, or
- user is the document owner

### Policy Expectations

- `vr_sessions` visibility must be constrained to users authorized for the underlying document.
- `vr_session_participants` visibility must be constrained to users authorized for the session's document.
- `vr_spatial_artifacts` visibility and mutation rights must be constrained to authorized participants.
- host migration or summon-related updates must only be writable by the current host or server-side automation acting on validated rules.

### Subscription Safety

- Hasura subscriptions must not expose rows for unrelated documents.
- Subscription variables must be scoped by both session and authorized document relationship.
- Server-side role mapping should avoid broad privileged roles in Unity or browser clients.

## Token Lifecycle

### Access Tokens

- Use short-lived access tokens for client API and signaling access.
- Tokens should remain in memory where possible, not long-term persistent storage.
- Expired tokens should require refresh through approved server flows rather than silent local extension.

### Refresh Tokens

- Refresh tokens should be avoided in standalone Unity clients unless operationally required.
- If refresh tokens are used on a headset, store them in the most constrained platform storage available and rotate aggressively.
- Token revocation must be respected by signaling, REST, and subscription entry points.

### Unity Memory Handling

- Avoid logging tokens, claims, or raw authorization headers.
- Clear in-memory token references on logout, disconnect, or fatal auth failure.
- Do not embed long-lived secrets in the client build.
- Re-authentication should be preferred over long-lived session material cached on device.

## Telemetry Rules

### Allowed Telemetry

- connection timing metrics
- room join and disconnect events
- packet loss and jitter aggregates
- processing status transitions
- feature usage counts for non-sensitive controls

### Restricted Telemetry

- do not log raw manuscript content
- do not log full voice transcripts by default
- do not log raw token values
- do not log full coordinate streams for user-authored strokes unless explicitly required for debugging in a controlled environment
- do not retain speech model inputs or outputs longer than needed for the active feature unless an explicit retention policy is approved

Note: session transcripts retained as product history are governed as application data, not telemetry, and must follow document and session authorization rules.

### Debugging Controls

- sensitive debug logging must be off by default in production
- temporary elevated logging should be time-boxed and access-controlled
- support logs should redact document identifiers where feasible when shared externally

## Device Compromise Assumption

Quest hardware and user-managed desktops should be treated as potentially compromised endpoints. Security controls therefore prioritize server-side authorization, short token lifetime, strict transport encryption, and narrow subscription scopes rather than trusting client runtime secrecy.

## Follow-Up Work

1. define concrete Hasura RLS policies for each new Vellum Rift table
2. define signaling token minting and expiry rules
3. define transcript field-level access and export rules for self-hosted speech services
4. define operational alerting for suspicious session or token activity