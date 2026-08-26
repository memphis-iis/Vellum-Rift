import type { Request, Response, NextFunction } from "express";
import { verifyHs256Jwt } from "./realtimeJwt.js";

export type RealtimeClaims = {
  sub: string;
  sessionId: string;
  playerId: string;
  email?: string;
  purpose?: string;
};

declare global {
  namespace Express {
    interface Request {
      realtime?: RealtimeClaims;
    }
  }
}

export function realtimeSecret(): string {
  return process.env.REALTIME_JWT_SECRET ?? process.env.JWT_SECRET ?? "local-dev-realtime-secret";
}

/**
 * When AUTH_REQUIRED is not true, accept requests and attach stub claims
 * derived from headers/body so local onboard works without Bluekey/IdP.
 */
export function requireRealtimeAuth(req: Request, res: Response, next: NextFunction): void {
  const authRequired = process.env.AUTH_REQUIRED === "true";
  const sessionIdParam =
    typeof req.params.sessionId === "string" ? req.params.sessionId : undefined;

  if (!authRequired) {
    const peerId =
      (typeof req.body?.peerId === "string" && req.body.peerId) ||
      (typeof req.query.peerId === "string" && req.query.peerId) ||
      "dev-peer";
    const playerId =
      (typeof req.body?.playerId === "string" && req.body.playerId) || peerId;
    const sessionId =
      sessionIdParam ||
      (typeof req.body?.sessionId === "string" && req.body.sessionId) ||
      "dev-session";
    req.realtime = {
      sub: "acct:dev",
      sessionId,
      playerId,
      email: "dev@memphis.edu",
      purpose: "sfu-signaling",
    };
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const payload = verifyHs256Jwt(header.slice(7), realtimeSecret());
  if (!payload || payload.purpose !== "sfu-signaling") {
    res.status(401).json({ error: "Invalid or expired realtime token" });
    return;
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
  const sub = typeof payload.sub === "string" ? payload.sub : playerId;
  if (!sessionId || !playerId) {
    res.status(401).json({ error: "Realtime token missing sessionId/playerId" });
    return;
  }

  if (sessionIdParam && sessionIdParam !== sessionId) {
    res.status(403).json({ error: "Token sessionId does not match path" });
    return;
  }

  req.realtime = {
    sub,
    sessionId,
    playerId,
    email: typeof payload.email === "string" ? payload.email : undefined,
    purpose: "sfu-signaling",
  };
  next();
}
