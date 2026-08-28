import type { AuthenticatedUser } from "./auth.js";
import { isKioskGuest } from "./auth.js";
import type { GameState, SessionVisibility } from "../components/gameState.js";
import { SessionAllowlistRepository } from "./sessionAllowlistRepository.js";
import { readKioskEnabled } from "./sessionKiosk.js";

export function normalizeEmail(input: string | null | undefined): string {
  return String(input || "").trim().toLowerCase();
}

export function parseVisibility(input: unknown): SessionVisibility | null {
  if (input === "public" || input === "private") return input;
  return null;
}

/** True when the Bluekey user is the durable session creator. */
export function isSessionCreator(
  user: Pick<AuthenticatedUser, "sub" | "email" | "kioskSessionId"> | undefined,
  state: GameState,
): boolean {
  if (!user || isKioskGuest(user)) return false;
  if (state.createdBySub && user.sub && state.createdBySub === user.sub) {
    return true;
  }
  const email = normalizeEmail(user.email);
  if (email && normalizeEmail(state.createdByEmail) === email) {
    return true;
  }
  return false;
}

/**
 * Host for ACL purposes: durable creator, or the current host player if their
 * Bluekey identity matches the requester. Kiosk guests are never host (#145).
 */
export function isSessionHost(
  user: Pick<AuthenticatedUser, "sub" | "email" | "kioskSessionId"> | undefined,
  state: GameState,
): boolean {
  if (isKioskGuest(user)) return false;
  if (isSessionCreator(user, state)) return true;
  if (!user) return false;
  const hostPlayer = state.players.find((p) => p.id === state.hostId);
  if (!hostPlayer) return false;
  if (hostPlayer.bluekeySub && user.sub && hostPlayer.bluekeySub === user.sub) {
    return true;
  }
  const email = normalizeEmail(user.email);
  if (email && normalizeEmail(hostPlayer.bluekeyEmail) === email) {
    return true;
  }
  return false;
}

/**
 * Session ACL:
 * - Kiosk guests may only touch their minted session while kiosk is enabled.
 * - Otherwise: host, public visibility, or allowlist (#136).
 */
export async function canAccessSession(
  user: Pick<AuthenticatedUser, "sub" | "email" | "kioskSessionId"> | undefined,
  state: GameState,
  allowlistRepo: SessionAllowlistRepository = new SessionAllowlistRepository(),
): Promise<boolean> {
  if (isKioskGuest(user)) {
    return (
      user!.kioskSessionId === state.sessionId &&
      readKioskEnabled(state.metadata) &&
      state.isActive
    );
  }
  if (isSessionHost(user, state)) return true;
  if (state.visibility === "public") return true;
  if (!user) return false;
  return allowlistRepo.isAllowlisted(state.sessionId, {
    sub: user.sub,
    email: user.email,
  });
}
