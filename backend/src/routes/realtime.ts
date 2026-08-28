import { Router, type Request, type Response } from "express";
import { isKioskGuest } from "../lib/auth.js";
import { signHs256Jwt } from "../lib/realtimeJwt.js";

const router = Router();

const DEFAULT_TTL_SEC = 300;

function realtimeSecret(): string {
  return process.env.REALTIME_JWT_SECRET ?? process.env.JWT_SECRET ?? "local-dev-realtime-secret";
}

function sfuPublicUrl(): string {
  return process.env.SFU_PUBLIC_URL ?? "http://localhost:4100";
}

/**
 * POST /api/realtime/token
 * Mint a short-lived token for SFU signaling. Requires Bluekey (or kiosk) auth
 * when AUTH_REQUIRED=true. Kiosk guests may only mint for their session (#145).
 * Body: { sessionId: string, playerId?: string }
 */
router.post("/token", (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (!sessionId || sessionId.length > 128) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  if (isKioskGuest(req.user) && req.user?.kioskSessionId !== sessionId) {
    res.status(403).json({ error: "Kiosk token does not match this space" });
    return;
  }

  const playerId =
    typeof req.body?.playerId === "string" && req.body.playerId.trim()
      ? req.body.playerId.trim().slice(0, 128)
      : (req.user?.sub ?? "anonymous");

  const ttlSec = Number(process.env.REALTIME_TOKEN_TTL_SEC ?? DEFAULT_TTL_SEC);
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;

  try {
    const token = signHs256Jwt(
      {
        sub: req.user?.sub ?? playerId,
        email: req.user?.email ?? "",
        sessionId,
        playerId,
        aud: process.env.JWT_AUDIENCE ?? "vellum-rift-clients",
        iss: process.env.JWT_ISSUER ?? "vellum-rift-local",
        purpose: "sfu-signaling",
      },
      realtimeSecret(),
      ttlSec,
    );

    res.json({
      token,
      expiresAt,
      sfuUrl: sfuPublicUrl(),
      sessionId,
      playerId,
    });
  } catch (err) {
    console.error("POST /api/realtime/token failed:", err);
    res.status(500).json({ error: "Failed to mint realtime token" });
  }
});

export default router;
