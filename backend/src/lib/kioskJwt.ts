import crypto from "node:crypto";
import { signHs256Jwt, verifyHs256Jwt } from "./realtimeJwt.js";

const PURPOSE = "kiosk-join";
const DEFAULT_TTL_SEC = 3600;

export function kioskJwtSecret(): string {
  return (
    process.env.KIOSK_JWT_SECRET ??
    process.env.JWT_SECRET ??
    "local-dev-kiosk-secret"
  );
}

export function kioskTokenTtlSec(): number {
  const raw = Number(process.env.KIOSK_TOKEN_TTL_SEC ?? DEFAULT_TTL_SEC);
  if (!Number.isFinite(raw) || raw < 60) return DEFAULT_TTL_SEC;
  return Math.min(Math.floor(raw), 86_400);
}

export type KioskTokenClaims = {
  sessionId: string;
  /** Stable guest identity for this minted token (stamped on the player). */
  sub: string;
  exp: number;
};

/**
 * Mint a short-lived HS256 JWT scoped to one session.
 * Guests present this as Authorization: Bearer on game-state / model reads.
 */
export function mintKioskToken(sessionId: string): {
  token: string;
  expiresAt: number;
  sub: string;
  ttlSec: number;
} {
  const ttlSec = kioskTokenTtlSec();
  const sub = `kiosk:${crypto.randomUUID()}`;
  const token = signHs256Jwt(
    {
      purpose: PURPOSE,
      sid: sessionId,
      sub,
      email: "",
    },
    kioskJwtSecret(),
    ttlSec,
  );
  return {
    token,
    expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
    sub,
    ttlSec,
  };
}

/** Verify a Bearer token as a kiosk guest JWT. Returns null if not a kiosk token. */
export function verifyKioskToken(token: string): KioskTokenClaims | null {
  const payload = verifyHs256Jwt(token, kioskJwtSecret());
  if (!payload) return null;
  if (payload.purpose !== PURPOSE) return null;
  const sessionId = typeof payload.sid === "string" ? payload.sid.trim() : "";
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sessionId || !sub.startsWith("kiosk:")) return null;
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  return { sessionId, sub, exp };
}
