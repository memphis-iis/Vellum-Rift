/**
 * Public kiosk join endpoints (#145).
 *
 * Mounted WITHOUT Bluekey requireAuth. Guests mint a short-lived session-scoped
 * JWT, then call /api/game-state and /api/models with that Bearer token.
 */

import { Router, type Request, type Response } from "express";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { mintKioskToken } from "../lib/kioskJwt.js";
import { checkRateLimit } from "../lib/kioskRateLimit.js";
import { readKioskEnabled } from "../lib/sessionKiosk.js";

const router = Router();
const repo = new GameStateRepository();

const param = (req: Request, name: string): string => String(req.params[name]);

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

// GET /api/kiosk/:sessionId/status — discover whether public join is open
router.get("/:sessionId/status", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const state = await repo.findById(sessionId);
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const kioskEnabled = readKioskEnabled(state.metadata);
    if (!kioskEnabled) {
      res.status(403).json({
        sessionId: state.sessionId,
        kioskEnabled: false,
        error: "Kiosk join is not enabled for this space",
      });
      return;
    }

    res.json({
      sessionId: state.sessionId,
      label: state.label,
      isActive: state.isActive,
      kioskEnabled: true,
    });
  } catch (err) {
    console.error("GET /api/kiosk/:sessionId/status failed:", err);
    res.status(500).json({ error: "Failed to read kiosk status" });
  }
});

// POST /api/kiosk/:sessionId/token — mint guest JWT (rate-limited)
router.post("/:sessionId/token", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const limit = checkRateLimit(`kiosk-token:${clientIp(req)}:${sessionId}`);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res.status(429).json({
        error: "Too many kiosk join attempts. Try again shortly.",
        retryAfterSec: limit.retryAfterSec,
      });
      return;
    }

    const state = await repo.findById(sessionId);
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!state.isActive) {
      res.status(403).json({ error: "This space is not active" });
      return;
    }
    if (!readKioskEnabled(state.metadata)) {
      res.status(403).json({ error: "Kiosk join is not enabled for this space" });
      return;
    }

    const minted = mintKioskToken(state.sessionId);
    res.status(201).json({
      accessToken: minted.token,
      tokenType: "Bearer",
      expiresAt: minted.expiresAt,
      expiresIn: minted.ttlSec,
      sessionId: state.sessionId,
      displayNameHint: "Guest",
    });
  } catch (err) {
    console.error("POST /api/kiosk/:sessionId/token failed:", err);
    res.status(500).json({ error: "Failed to mint kiosk token" });
  }
});

export default router;
