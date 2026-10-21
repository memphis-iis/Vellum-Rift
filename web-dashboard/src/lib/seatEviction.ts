/** Reasons a local seat client must exit the space. */
export type SeatEvictionReason = "kick" | "takeover";

/**
 * Detect kick (self missing) or seat takeover (connectionId changed).
 * Returns null when the local seat is still valid.
 */
export function evaluateSeatEviction(
  players: ReadonlyArray<{ id: string; connectionId?: string | null }> | null | undefined,
  localPlayerId: string | null | undefined,
  localConnectionId: string | null | undefined,
): SeatEvictionReason | null {
  if (!localPlayerId) return null;
  const self = players?.find((p) => p && p.id === localPlayerId);
  if (!self) return "kick";
  if (
    localConnectionId &&
    self.connectionId &&
    self.connectionId !== localConnectionId
  ) {
    return "takeover";
  }
  return null;
}

export function seatEvictionMessage(reason: SeatEvictionReason): string {
  return reason === "takeover"
    ? "Another window took your seat in this space."
    : "You were removed from this space.";
}
