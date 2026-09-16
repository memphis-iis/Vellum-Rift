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
import { readSessionEvent } from "../lib/sessionEvent.js";

const router = Router();
const repo = new GameStateRepository();

const param = (req: Request, name: string): string => String(req.params[name]);

const SPACE_NOT_FOUND =
  "Space not found. Check the ID on the signage.";

/** Postgres UUID shape — malformed ids throw 22P02 instead of returning no rows (#250). */
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSessionId(sessionId: string): boolean {
  return SESSION_ID_RE.test(sessionId.trim());
}

/** Postgres rejects non-UUID session_id with 22P02 — map to guest-safe 404 (#250). */
function isInvalidUuidError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  return code === "22P02" || /invalid input syntax for type uuid/i.test(msg);
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function eventHasEnded(endsAt: string | null, nowMs: number): boolean {
  if (!endsAt) return false;
  const t = Date.parse(endsAt);
  return Number.isFinite(t) && t < nowMs;
}

/**
 * GET /api/kiosk/events — anonymous list of public events for VR Join exhibit.
 * Filters: active + public + kind event + not ended (same discovery bar as
 * dashboard Featured for walk-up guests). Includes `kioskEnabled` so clients
 * can show status; mint still requires kiosk on.
 * Must be registered before /:sessionId routes.
 */
router.get("/events", async (_req: Request, res: Response) => {
  try {
    const sessions = await repo.findAll();
    const nowMs = Date.now();
    const events = sessions
      .filter((s) => {
        if (!s.isActive) return false;
        if (s.visibility !== "public") return false;
        const { kind, endsAt } = readSessionEvent(s.metadata);
        if (kind !== "event") return false;
        if (eventHasEnded(endsAt, nowMs)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
          b.sessionId.localeCompare(a.sessionId),
      )
      .map((s) => {
        const { kind, startsAt, endsAt } = readSessionEvent(s.metadata);
        return {
          sessionId: s.sessionId,
          label: s.label,
          isActive: s.isActive,
          visibility: s.visibility,
          kind,
          startsAt,
          endsAt,
          updatedAt: s.updatedAt,
          kioskEnabled: readKioskEnabled(s.metadata),
        };
      });
    res.json(events);
  } catch (err) {
    console.error("GET /api/kiosk/events failed:", err);
    res.status(500).json({ error: "Failed to list public events" });
  }
});

// GET /api/kiosk/:sessionId/status — discover whether public join is open
router.get("/:sessionId/status", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId").trim();
    if (!sessionId || !isSessionId(sessionId)) {
      res.status(404).json({ error: SPACE_NOT_FOUND });
      return;
    }
    const state = await repo.findById(sessionId);
    if (!state) {
      res.status(404).json({ error: SPACE_NOT_FOUND });
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
    if (isInvalidUuidError(err)) {
      res.status(404).json({ error: SPACE_NOT_FOUND });
      return;
    }
    console.error("GET /api/kiosk/:sessionId/status failed:", err);
    res.status(500).json({ error: "Failed to read kiosk status" });
  }
});

// POST /api/kiosk/:sessionId/token — mint guest JWT (rate-limited)
router.post("/:sessionId/token", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId").trim();
    if (!sessionId || !isSessionId(sessionId)) {
      res.status(404).json({ error: SPACE_NOT_FOUND });
      return;
    }
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
      res.status(404).json({ error: SPACE_NOT_FOUND });
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
    if (isInvalidUuidError(err)) {
      res.status(404).json({ error: SPACE_NOT_FOUND });
      return;
    }
    console.error("POST /api/kiosk/:sessionId/token failed:", err);
    res.status(500).json({ error: "Failed to mint kiosk token" });
  }
});

export default router;
