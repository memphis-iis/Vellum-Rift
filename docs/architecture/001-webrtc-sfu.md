# SDD 001: WebRTC SFU And Realtime Collaboration

## Context

Vellum Rift requires low-latency, multi-user communication across Web, Quest, and SteamVR clients. The product needs spatial voice, a global radio override, realtime player awareness, and fast collaborative drawing updates.

## Decision

Use a custom WebRTC backend server in an SFU-style topology for ephemeral realtime traffic.

Use cases that fit this layer:

- spatial voice chat
- global radio broadcast
- participant presence and movement updates
- high-frequency in-progress stroke streaming

Use cases that do not fit this layer:

- durable annotations
- room ownership rules
- exportable session data
- long-term document metadata

Those durable behaviors belong in PostgreSQL and Hasura-driven APIs.

## Data Split

### Media

- Audio streams are transported with WebRTC media tracks.
- Clients spatialize voice locally against participant transforms.
- A global radio mode bypasses attenuation.

### Data Channel

- Low-latency movement and drawing packets travel over WebRTC data channels.
- In-progress drawing should be rendered optimistically on receiving clients.
- Completed strokes are committed to persisted storage after stroke end.

## Rationale

WebSockets are appropriate for durable state changes and subscriptions, but not ideal for high-frequency, latency-sensitive drawing and voice workloads. The SFU split keeps persisted state clean while reducing jitter for motion and audio.

## Contracts To Define Next

1. participant heartbeat and disconnect rules
2. packet shape for movement updates
3. packet shape for in-progress stroke points
4. radio-mode signaling behavior
5. browser and Unity plugin interoperability boundaries