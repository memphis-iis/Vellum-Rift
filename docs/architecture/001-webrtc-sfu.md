# SDD 001: WebRTC SFU And Realtime Collaboration

## Context

Vellum Rift requires low-latency, multi-user communication across Web, Quest, and SteamVR clients. The product needs spatial voice, a global radio override, realtime player awareness, and fast collaborative drawing updates.

## Decision

Use a custom WebRTC backend (`webrtc-sfu`) in an SFU-style topology for ephemeral realtime traffic.

Use cases that fit this layer:

- spatial voice chat (media plane — foundation not fully relayed yet)
- global radio broadcast
- participant presence and movement updates
- high-frequency in-progress stroke streaming

Use cases that do not fit this layer:

- durable annotations
- room ownership rules
- exportable session data
- long-term document metadata

Those durable behaviors belong in PostgreSQL and the Express REST API.

## Current foundation (signaling)

This repo ships **authenticated signaling** and a **presence/movement packet contract**. Full media SFU (mediasoup / track relay) remains a follow-up.

### Auth flow

1. Client authenticates to the Express backend with Bluekey (when `AUTH_REQUIRED=true`).
2. Client calls `POST /api/realtime/token` with `{ sessionId, playerId? }` and receives a short-lived HS256 JWT (`purpose: "sfu-signaling"`), `expiresAt`, and `sfuUrl`.
3. Client presents that JWT as `Authorization: Bearer …` on SFU `/v1/sessions/...` routes.
4. Backend and SFU share `REALTIME_JWT_SECRET` (falls back to `JWT_SECRET`, then a local-dev default).

When `AUTH_REQUIRED` is not `true` on the SFU, signaling accepts requests without a Bearer token (stub claims) so local onboard works without an IdP.

### Signaling HTTP API (`webrtc-sfu`, default port 4100)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/sessions/:sessionId/join` | Join room; returns peer list + ICE server hints |
| `POST` | `/v1/sessions/:sessionId/signal` | Enqueue offer / answer / ICE for a peer |
| `GET` | `/v1/sessions/:sessionId/signal?peerId=` | Drain pending signaling messages |
| `POST` | `/v1/sessions/:sessionId/heartbeat` | Keep peer alive (stale peers pruned ~45s) |
| `POST` | `/v1/sessions/:sessionId/leave` | Leave room |
| `GET` | `/v1/contracts/packets` | Packet contract discovery |

Offer/answer/ICE exchange is an in-memory per-peer inbox (REST poll). Clients still establish peer connections with DTLS/SRTP as usual; the SFU does not yet forward media tracks.

### Presence / movement packet contract (data channel)

JSON (UTF-8) over a WebRTC data channel. Prefer unreliable/unordered when the platform allows. Receivers MUST ignore unknown `type` values.

Shared version: `v: 1` (`PACKET_VERSION` in `webrtc-sfu/src/packets.ts`).

**Pose**

```json
{ "x": 0, "y": 0, "z": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1 }
```

**presence** — periodic or on-change avatar pose

```json
{
  "v": 1,
  "type": "presence",
  "sessionId": "…",
  "playerId": "…",
  "t": 1710000000000,
  "pose": { "x": 0, "y": 0, "z": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1 },
  "flags": { "radio": false }
}
```

**movement** — higher-rate pose; receivers may coalesce

```json
{
  "v": 1,
  "type": "movement",
  "sessionId": "…",
  "playerId": "…",
  "t": 1710000000000,
  "pose": { "x": 0, "y": 0, "z": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1 },
  "vel": { "x": 0, "y": 0, "z": 0 }
}
```

**heartbeat** — lightweight liveness on the data plane

```json
{
  "v": 1,
  "type": "heartbeat",
  "sessionId": "…",
  "playerId": "…",
  "t": 1710000000000
}
```

## Data Split

### Media

- Audio streams are transported with WebRTC media tracks.
- Clients spatialize voice locally against participant transforms.
- A global radio mode bypasses attenuation (`flags.radio` on presence).

### Data Channel

- Low-latency movement and drawing packets travel over WebRTC data channels.
- In-progress drawing should be rendered optimistically on receiving clients.
- Completed strokes are committed to persisted storage after stroke end.

## Rationale

WebSockets are appropriate for durable state changes and subscriptions, but not ideal for high-frequency, latency-sensitive drawing and voice workloads. The SFU split keeps persisted state clean while reducing jitter for motion and audio.

## Remaining work

1. Media SFU / selective forwarding of audio tracks
2. Stroke packet shapes for in-progress drawing (beyond presence/movement)
3. Replace HTTP game-state presence polling with data-channel presence (IMPL-022)
4. Browser and Unity WebRTC plugin interoperability hardening
