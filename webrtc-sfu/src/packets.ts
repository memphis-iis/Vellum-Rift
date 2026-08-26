/**
 * Presence / movement packet contract for WebRTC data channels (SDD 001).
 *
 * Packets are JSON (UTF-8) on an unreliable, unordered data channel when possible.
 * Clients SHOULD ignore unknown `type` values for forward compatibility.
 */

export const PACKET_VERSION = 1 as const;

export type Pose = {
  x: number;
  y: number;
  z: number;
  /** Unit quaternion */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};

/** Periodic or on-change pose update for remote avatars / radar. */
export type PresencePacket = {
  v: typeof PACKET_VERSION;
  type: "presence";
  sessionId: string;
  playerId: string;
  /** Unix epoch milliseconds */
  t: number;
  pose: Pose;
  flags?: {
    /** Global radio mode bypasses spatial attenuation on the media plane */
    radio?: boolean;
  };
};

/** Higher-rate movement delta; receivers may coalesce. */
export type MovementPacket = {
  v: typeof PACKET_VERSION;
  type: "movement";
  sessionId: string;
  playerId: string;
  t: number;
  pose: Pose;
  /** Optional linear velocity hint (units/sec) */
  vel?: { x: number; y: number; z: number };
};

export type HeartbeatPacket = {
  v: typeof PACKET_VERSION;
  type: "heartbeat";
  sessionId: string;
  playerId: string;
  t: number;
};

export type RealtimePacket = PresencePacket | MovementPacket | HeartbeatPacket;

export function isRealtimePacket(value: unknown): value is RealtimePacket {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.v !== PACKET_VERSION) return false;
  if (typeof v.sessionId !== "string" || typeof v.playerId !== "string") return false;
  if (typeof v.t !== "number") return false;
  return v.type === "presence" || v.type === "movement" || v.type === "heartbeat";
}
