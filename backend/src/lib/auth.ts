/**
 * Bluekey SSO authentication middleware.
 *
 * Verifies Bearer tokens against the Bluekey introspection endpoint.
 * When AUTH_REQUIRED=true, protected routes require a valid Bluekey token.
 *
 * Kiosk guests (#145) use a separate HS256 JWT; accept them only via
 * `requireAuthOrKiosk` on session/model/realtime surfaces — never on upload.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyKioskToken } from "./kioskJwt.js";

// ---------------------------------------------------------------------------
// Config (read from env)
// ---------------------------------------------------------------------------

export const BLUEKEY_CONFIG = {
  /** The app UUID registered in the Bluekey catalog. Set this in .env. */
  softwareId: process.env.BLUEKEY_SOFTWARE_ID ?? "",

  /** Bluekey portal URL for the frontend login popup. */
  portalUrl:
    process.env.BLUEKEY_PORTAL_URL ??
    "https://iis.memphis.edu/static/bluekey/",

  /** Origin to validate against postMessage events. */
  origin:
    process.env.BLUEKEY_ORIGIN ?? "https://iis.memphis.edu",

  /** When false, the middleware passes through without checking tokens (dev mode). */
  required: process.env.AUTH_REQUIRED === "true",

  /** Introspection endpoint. */
  introspectUrl:
    process.env.BLUEKEY_INTROSPECT_URL ??
    "https://iis.memphis.edu/apis/bluekey/public/sso/introspect",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  sub: string;
  email: string;
  exp: number;
  /**
   * When set, this request is a museum kiosk guest scoped to one session (#145).
   * Never treat as session host.
   */
  kioskSessionId?: string;
}

/** True when the caller authenticated with a kiosk join token. */
export function isKioskGuest(
  user: Pick<AuthenticatedUser, "kioskSessionId"> | undefined,
): boolean {
  return Boolean(user?.kioskSessionId);
}

// Extend Express Request to carry the authenticated user.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Token introspection
// ---------------------------------------------------------------------------

/**
 * Call the Bluekey introspection endpoint to verify a token.
 */
async function introspectToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const response = await fetch(BLUEKEY_CONFIG.introspectUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, appUuid: BLUEKEY_CONFIG.softwareId }),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      active: boolean;
      sub: string;
      email: string;
      exp: number;
    };

    if (!data.active) return null;

    return { sub: data.sub, email: data.email, exp: data.exp };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function extractBearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function attachDevStub(req: Request): void {
  req.user = {
    sub: "acct:dev",
    email: "dev@memphis.edu",
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
}

/**
 * Express middleware that protects routes with Bluekey authentication.
 *
 * Usage:
 *   import { requireAuth } from "./lib/auth.js";
 *   app.post("/api/upload", requireAuth, uploadHandler);
 *
 * In development (AUTH_REQUIRED !== true), this will pass through
 * any request without checking the token.
 *
 * Kiosk JWTs are rejected here (401) — use `requireAuthOrKiosk` for
 * session join / poll / model download surfaces.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // In dev mode, attach a stub user and let everything through.
  if (!BLUEKEY_CONFIG.required) {
    attachDevStub(req);
    next();
    return;
  }

  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  // Do not accept kiosk tokens on Bluekey-only routes (upload, jobs, …).
  if (verifyKioskToken(token)) {
    res.status(401).json({ error: "Kiosk token not accepted on this route" });
    return;
  }

  const user = await introspectToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = user;
  next();
}

/**
 * Bluekey **or** session-scoped kiosk guest JWT (#145).
 * Used for `/api/game-state`, `/api/models`, and `/api/realtime`.
 */
export async function requireAuthOrKiosk(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!BLUEKEY_CONFIG.required) {
    attachDevStub(req);
    next();
    return;
  }

  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const kiosk = verifyKioskToken(token);
  if (kiosk) {
    req.user = {
      sub: kiosk.sub,
      email: "",
      exp: kiosk.exp,
      kioskSessionId: kiosk.sessionId,
    };
    next();
    return;
  }

  const user = await introspectToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = user;
  next();
}
