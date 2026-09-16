/**
 * Presence TTL for session players (#253).
 * Marks isConnected=false when no activity (position/etc.) within the window.
 */

import type { GameState, PlayerState } from "../components/gameState.js";

const DEFAULT_TTL_MS = 90_000;

export function playerDisconnectTtlMs(): number {
  const raw = Number(process.env.PLAYER_DISCONNECT_TTL_MS ?? DEFAULT_TTL_MS);
  if (!Number.isFinite(raw) || raw < 5_000) return DEFAULT_TTL_MS;
  return Math.min(Math.floor(raw), 30 * 60_000);
}

/** Stamp activity so disconnect TTL stays fresh. */
export function touchPlayerPresence(player: PlayerState): void {
  player.lastSeenAt = new Date().toISOString();
  player.isConnected = true;
}

function lastSeenMs(player: PlayerState): number {
  const raw = player.lastSeenAt || player.joinedAt;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Mark players idle past TTL as disconnected.
 * Returns true when any player changed (caller should persist).
 */
export function pruneStalePlayers(
  state: GameState,
  now = Date.now(),
  ttlMs = playerDisconnectTtlMs(),
): boolean {
  let changed = false;
  for (const player of state.players) {
    if (!player.isConnected) continue;
    if (now - lastSeenMs(player) <= ttlMs) continue;
    player.isConnected = false;
    changed = true;
  }
  if (changed) {
    state.updatedAt = new Date().toISOString();
  }
  return changed;
}
