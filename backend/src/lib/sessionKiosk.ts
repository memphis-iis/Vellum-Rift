/**
 * Session kiosk / public-join flag (#145).
 * Stored in game_sessions.metadata.kioskEnabled (no schema migration).
 */

export const KIOSK_ENABLED_KEY = "kioskEnabled";

export function readKioskEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[KIOSK_ENABLED_KEY] === true;
}

export function writeKioskEnabled(
  metadata: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const next = { ...metadata };
  if (enabled) {
    next[KIOSK_ENABLED_KEY] = true;
  } else {
    delete next[KIOSK_ENABLED_KEY];
  }
  return next;
}
