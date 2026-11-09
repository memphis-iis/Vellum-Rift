/**
 * Session-wide manuscript relief multiplier (#328).
 * Stored in game_sessions.metadata.depthScale (no schema migration).
 * Clients apply as model localScale.z — no GLB reprocess.
 */

export const DEPTH_SCALE_KEY = "depthScale";
export const DEPTH_SCALE_DEFAULT = 1;
export const DEPTH_SCALE_MIN = 0;
export const DEPTH_SCALE_MAX = 5;

export function clampDepthScale(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(DEPTH_SCALE_MAX, Math.max(DEPTH_SCALE_MIN, raw));
}

export function readDepthScale(
  metadata: Record<string, unknown> | null | undefined,
): number {
  const clamped = clampDepthScale(metadata?.[DEPTH_SCALE_KEY]);
  return clamped ?? DEPTH_SCALE_DEFAULT;
}

export function writeDepthScale(
  metadata: Record<string, unknown>,
  scale: number,
): Record<string, unknown> {
  const clamped = clampDepthScale(scale) ?? DEPTH_SCALE_DEFAULT;
  return { ...metadata, [DEPTH_SCALE_KEY]: clamped };
}
