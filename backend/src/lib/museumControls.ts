/**
 * Museum-path helpers for lobby respawn + Quest control schemes (#322).
 * Museum path = event Space with kiosk/public join enabled.
 */

import { readKioskEnabled } from "./sessionKiosk.js";
import { readSessionEvent } from "./sessionEvent.js";

export const DEFAULT_SPAWN_RADIUS = 14;
export const DEFAULT_SPAWN_SLOT_COUNT = 8;

export type ControlSchemeId = "default" | "splitLaserJetpack";

export type PendingRespawn = {
  seq: number;
  x: number;
  y: number;
  z: number;
  /** Yaw degrees (Unity euler Y) facing manuscript origin. */
  yaw: number;
};

export function isMuseumPath(metadata: Record<string, unknown> | null | undefined): boolean {
  const { kind } = readSessionEvent(metadata);
  return kind === "event" && readKioskEnabled(metadata);
}

export function parseControlScheme(input: unknown): ControlSchemeId | null {
  if (input === "default" || input === "splitLaserJetpack") return input;
  return null;
}

/**
 * Gallery ring slot matching Unity GalleryEnvironment.GetSpawnSlot:
 * angle = (slot % n) * 2π/n, pos = (sin θ · r, 0.05, cos θ · r), face origin.
 */
export function computeGallerySpawnSlot(
  slotIndex: number,
  options?: { radius?: number; slotCount?: number },
): PendingRespawn {
  const radius = Math.max(4, options?.radius ?? DEFAULT_SPAWN_RADIUS);
  const n = Math.max(1, options?.slotCount ?? DEFAULT_SPAWN_SLOT_COUNT);
  const angle = (slotIndex % n) * ((Math.PI * 2) / n);
  const x = Math.sin(angle) * radius;
  const y = 0.05;
  const z = Math.cos(angle) * radius;
  // Look toward origin on XZ — yaw = atan2(-x, -z) in degrees (Unity left-handed Y-up).
  const yaw = (Math.atan2(-x, -z) * 180) / Math.PI;
  return { seq: 0, x, y, z, yaw };
}

/** Optional spawn radius from session metadata (meters). */
export function readSpawnRadius(metadata: Record<string, unknown> | null | undefined): number {
  const raw = metadata?.spawnRadius ?? metadata?.gallerySpawnRadius;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 4) return DEFAULT_SPAWN_RADIUS;
  return n;
}
