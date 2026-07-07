/**
 * Bluekey SSO authentication middleware.
 *
 * In its current form, this is a **stub** — it accepts any token in development
 * mode so that the interns can build features without being blocked.
 *
 * When you (the maintainer) set `BLUEKEY_SOFTWARE_ID` in your .env and flip
 * `AUTH_REQUIRED=true`, this middleware will:
 *
 *   1. Extract the Bearer token from the `Authorization` header.
 *   2. Call the Bluekey introspection endpoint to verify it.
 *   3. Attach the verified user to `req.user`.
 *   4. Reject unauthenticated requests with a 401.
 *
 * Bluekey introspect endpoint:
 *   POST https://iis.memphis.edu/apis/bluekey/public/sso/introspect
 *   Body: { token: string, appUuid: string }
 *   Response: { active: boolean, sub: string, email: string, exp: number }
 */

import type { Request, Response, NextFunction } from "express";

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
 *
 * TODO: When you have a real `BLUEKEY_SOFTWARE_ID`, implement this with
 *       `fetch()` or `axios`. For now it returns a mock verified user so
 *       that feature development is not blocked.
 */
async function introspectToken(token: string): Promise<AuthenticatedUser | null> {
  // -------------------------------------------------------------------
  // STUB: In dev mode (AUTH_REQUIRED !== true) accept any token.
  // Remove this branch once you have a real BLUEKEY_SOFTWARE_ID.
  // -------------------------------------------------------------------
  if (!BLUEKEY_CONFIG.required) {
    return {
      sub: "acct:stub-dev",
      email: "dev@memphis.edu",
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
    };
  }

  // -------------------------------------------------------------------
  // REAL IMPLEMENTATION (uncomment and fill in when ready):
  // -------------------------------------------------------------------
  // try {
  //   const response = await fetch(BLUEKEY_CONFIG.introspectUrl, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ token, appUuid: BLUEKEY_CONFIG.softwareId }),
  //   });
  //
  //   if (!response.ok) return null;
  //
  //   const data = await response.json() as {
  //     active: boolean;
  //     sub: string;
  //     email: string;
  //     exp: number;
  //   };
  //
  //   if (!data.active) return null;
  //
  //   return { sub: data.sub, email: data.email, exp: data.exp };
  // } catch {
  //   return null;
  // }

  return null;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that protects routes with Bluekey authentication.
 *
 * Usage:
 *   import { requireAuth } from "./lib/auth.js";
 *   app.post("/api/upload", requireAuth, uploadHandler);
 *
 * In development (AUTH_REQUIRED !== true), this will pass through
 * any request without checking the token.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // In dev mode, attach a stub user and let everything through.
  if (!BLUEKEY_CONFIG.required) {
    req.user = {
      sub: "acct:dev",
      email: "dev@memphis.edu",
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
    next();
    return;
  }

  // Extract the Bearer token.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // Verify the token against Bluekey.
  const user = await introspectToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = user;
  next();
}