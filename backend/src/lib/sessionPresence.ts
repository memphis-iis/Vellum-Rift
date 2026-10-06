/**
 * Presence hygiene for long-lived museum / kiosk sessions.
 * Guests that never call DELETE /players leave isConnected=true forever;
 * prune by lastSeenAt (preferred) or joinedAt so game-state stays usable.
 * Lasers are push-to-talk: expire when heartbeats stop.
 */

import type { GameState, PlayerState } from "../components/gameState.js";

/**
 * Drop non-host players idle longer than this. Museum Play Mode / Quest
 * restarts leave "Guest" rows; 3 minutes is long enough for a bathroom break
 * and short enough to clear a ghost field.
 */
export const DEFAULT_GUEST_IDLE_MS = 3 * 60 * 1000;

/** @deprecated use DEFAULT_GUEST_IDLE_MS — kept for older call sites. */
export const DEFAULT_STALE_PLAYER_HOURS = DEFAULT_GUEST_IDLE_MS / (1000 * 60 * 60);

/** Drop metadata.artifacts older than this (museum test pins). */
export const DEFAULT_STALE_ARTIFACT_HOURS = 24;

/**
 * Laser heartbeats arrive ~30 Hz while held. Anything older than this is a
 * stuck beam from a crashed / closed client and must not render.
 */
export const DEFAULT_LASER_TTL_MS = 2500;

function ageHours(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (nowMs - t) / (1000 * 60 * 60);
}

function ageMs(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return nowMs - t;
}

function presenceStamp(player: PlayerState): string | null {
  if (typeof player.lastSeenAt === "string" && player.lastSeenAt.trim())
    return player.lastSeenAt;
  return player.joinedAt ?? null;
}

/** Normalize idle TTL: values &lt; 1000 are treated as hours (legacy API). */
function normalizeIdleMs(idle: number): number {
  if (idle > 0 && idle < 1000) return idle * 60 * 60 * 1000;
  return idle;
}

/**
 * Remove non-host players whose last activity is older than guestIdleMs.
 * Returns how many players were removed.
 */
export function pruneStalePlayers(
  state: GameState,
  guestIdleMs: number = DEFAULT_GUEST_IDLE_MS,
  nowMs: number = Date.now(),
): number {
  const idleMs = normalizeIdleMs(guestIdleMs);
  const before = state.players.length;
  const hostId = state.hostId;
  state.players = state.players.filter((p) => {
    if (!p) return false;
    // Only the current hostId is immortal; stale isHost flags must expire.
    if (p.id === hostId) return true;
    return ageMs(presenceStamp(p), nowMs) <= idleMs;
  });
  const removed = before - state.players.length;
  if (removed > 0) state.updatedAt = new Date(nowMs).toISOString();
  return removed;
}

/**
 * Clear laserActive when the holder stopped sending laser heartbeats.
 * Returns how many lasers were cleared.
 */
export function expireStaleLasers(
  state: GameState,
  ttlMs: number = DEFAULT_LASER_TTL_MS,
  nowMs: number = Date.now(),
): number {
  let cleared = 0;
  for (const p of state.players) {
    if (!p?.laserActive) continue;
    const stamp = p.lastLaserAt ?? null;
    // Missing stamp = legacy stuck beam (never heartbeated under new schema).
    if (ageMs(stamp, nowMs) > ttlMs) {
      p.laserActive = false;
      p.lastLaserAt = undefined;
      cleared += 1;
    }
  }
  if (cleared > 0) state.updatedAt = new Date(nowMs).toISOString();
  return cleared;
}

/**
 * Mark players without a recent presence stamp as disconnected so they
 * stop appearing in /lasers and connected-only UIs. Host stays in the
 * roster; only the connected flag flips.
 */
export function markIdleDisconnected(
  state: GameState,
  idleMs: number = DEFAULT_GUEST_IDLE_MS,
  nowMs: number = Date.now(),
): number {
  const ttlMs = normalizeIdleMs(idleMs);
  let flipped = 0;
  for (const p of state.players) {
    if (!p?.isConnected) continue;
    if (ageMs(presenceStamp(p), nowMs) <= ttlMs) continue;
    p.isConnected = false;
    p.laserActive = false;
    p.lastLaserAt = undefined;
    flipped += 1;
  }
  if (flipped > 0) state.updatedAt = new Date(nowMs).toISOString();
  return flipped;
}

/**
 * Remove metadata.artifacts older than maxAgeHours.
 * Returns how many artifacts were removed.
 */
export function pruneStaleArtifacts(
  state: GameState,
  maxAgeHours: number = DEFAULT_STALE_ARTIFACT_HOURS,
  nowMs: number = Date.now(),
): number {
  const arts = state.metadata?.artifacts;
  if (!Array.isArray(arts) || arts.length === 0) return 0;

  const kept = arts.filter((a) => {
    if (!a || typeof a !== "object") return false;
    const rec = a as { createdAt?: string; updatedAt?: string };
    const stamp = rec.updatedAt || rec.createdAt;
    return ageHours(stamp, nowMs) <= maxAgeHours;
  });
  const removed = arts.length - kept.length;
  if (removed > 0) {
    state.metadata = { ...state.metadata, artifacts: kept };
    state.updatedAt = new Date(nowMs).toISOString();
  }
  return removed;
}

/** Stamp lastSeenAt on a player (position / laser heartbeats). */
export function touchPlayerSeen(player: PlayerState, nowIso?: string): void {
  player.lastSeenAt = nowIso ?? new Date().toISOString();
}

/** Stamp lastLaserAt while the beam is held. */
export function touchPlayerLaser(player: PlayerState, nowIso?: string): void {
  const iso = nowIso ?? new Date().toISOString();
  player.lastLaserAt = iso;
  player.lastSeenAt = iso;
}
