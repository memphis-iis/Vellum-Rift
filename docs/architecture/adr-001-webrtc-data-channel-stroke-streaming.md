# ADR 001: WebRTC Data Channels For Real-Time Drawing Synchronization

## Status

Approved (2026-05-29)

## Context

Vellum Rift requires real-time multi-user drawing synchronization. When a VR user sketches a 3D stroke to reconstruct a faded or degraded ink trail, that path must render point-by-point for all other team members in the room across Web and native VR clients.

We evaluated using the existing Hasura and WebSocket subscription layer for this high-frequency vector point streaming because it already supports room persistence and spatial artifact synchronization.

## Decision

Active in-flight stroke generation will bypass Hasura and ordinary WebSocket persistence flows. Instead, point arrays will be sent over an unreliable, unordered WebRTC data channel through the self-hosted SFU layer.

Completed strokes will be flushed through persisted APIs only after draw completion.

## Rationale And Tradeoffs

1. TCP-backed WebSocket transport introduces retransmission and ordering behavior that causes visible stutter for live drawing when packets are delayed.
2. Streaming raw point updates into persisted storage at interactive rates would flood durable systems with temporary state.
3. Binary packet transport over WebRTC data channels is more bandwidth-efficient than frequent JSON payloads for point-by-point coordinate updates.

## Consequences

### Positive

- smoother cross-play drawing updates
- reduced write amplification against PostgreSQL-backed systems
- better fit for latency-sensitive in-progress rendering

### Negative

- clients must manage both persisted-state networking and realtime WebRTC networking
- partial point loss may produce temporary jagged remote rendering during the active stroke

### Data Integrity Safety Catch

The drawing author's local client is responsible for flushing the full completed vector path through the durable mutation path after trigger release. That persisted stroke becomes the authoritative representation and corrects any temporary point loss seen during the live draw phase.