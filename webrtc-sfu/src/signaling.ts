import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { requireRealtimeAuth } from "./auth.js";
import {
  drainSignals,
  enqueueSignal,
  joinPeer,
  leavePeer,
  pruneStalePeers,
  touchPeer,
} from "./rooms.js";

const router = Router();

function iceServers() {
  const urls = (process.env.ICE_SERVERS ?? "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return urls.map((url) => ({ urls: url }));
}

/**
 * POST /v1/sessions/:sessionId/join
 * Body: { peerId?: string, displayName?: string }
 */
router.post("/sessions/:sessionId/join", requireRealtimeAuth, (req: Request, res: Response) => {
  pruneStalePeers();
  const sessionId = req.params.sessionId as string;
  const peerId =
    (typeof req.body?.peerId === "string" && req.body.peerId.trim()) ||
    randomUUID();
  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName.slice(0, 64) : undefined;

  const { peer, others } = joinPeer(sessionId, {
    peerId,
    playerId: req.realtime!.playerId,
    displayName,
  });

  res.status(201).json({
    sessionId,
    peerId: peer.peerId,
    playerId: peer.playerId,
    peers: others.map((p) => ({
      peerId: p.peerId,
      playerId: p.playerId,
      displayName: p.displayName,
    })),
    iceServers: iceServers(),
    packetContract: {
      version: 1,
      types: ["presence", "movement", "heartbeat"],
      docs: "docs/architecture/001-webrtc-sfu.md",
    },
  });
});

/**
 * POST /v1/sessions/:sessionId/signal
 * Body: { fromPeerId, toPeerId, type: offer|answer|ice, sdp?, candidate? }
 */
router.post("/sessions/:sessionId/signal", requireRealtimeAuth, (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const fromPeerId = typeof req.body?.fromPeerId === "string" ? req.body.fromPeerId : "";
  const toPeerId = typeof req.body?.toPeerId === "string" ? req.body.toPeerId : "";
  const type = req.body?.type;
  if (!fromPeerId || !toPeerId || (type !== "offer" && type !== "answer" && type !== "ice")) {
    res.status(400).json({ error: "fromPeerId, toPeerId, and type(offer|answer|ice) are required" });
    return;
  }
  if (!touchPeer(sessionId, fromPeerId)) {
    res.status(404).json({ error: "fromPeerId is not joined to this session" });
    return;
  }

  const message = {
    id: randomUUID(),
    sessionId,
    fromPeerId,
    toPeerId,
    type: type as "offer" | "answer" | "ice",
    sdp: typeof req.body?.sdp === "string" ? req.body.sdp : undefined,
    candidate: req.body?.candidate,
    createdAt: Date.now(),
  };

  if (!enqueueSignal(message)) {
    res.status(404).json({ error: "toPeerId is not joined to this session" });
    return;
  }

  res.status(202).json({ queued: true, id: message.id });
});

/**
 * GET /v1/sessions/:sessionId/signal?peerId=
 * Drain pending offer/answer/ICE messages for this peer.
 */
router.get("/sessions/:sessionId/signal", requireRealtimeAuth, (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const peerId = typeof req.query.peerId === "string" ? req.query.peerId : "";
  if (!peerId) {
    res.status(400).json({ error: "peerId query param is required" });
    return;
  }
  if (!touchPeer(sessionId, peerId)) {
    res.status(404).json({ error: "peerId is not joined to this session" });
    return;
  }
  const messages = drainSignals(sessionId, peerId);
  res.json({ messages });
});

/**
 * POST /v1/sessions/:sessionId/leave
 * Body: { peerId }
 */
router.post("/sessions/:sessionId/leave", requireRealtimeAuth, (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const peerId = typeof req.body?.peerId === "string" ? req.body.peerId : "";
  if (!peerId) {
    res.status(400).json({ error: "peerId is required" });
    return;
  }
  leavePeer(sessionId, peerId);
  res.status(204).send();
});

/**
 * POST /v1/sessions/:sessionId/heartbeat
 * Body: { peerId }
 */
router.post("/sessions/:sessionId/heartbeat", requireRealtimeAuth, (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const peerId = typeof req.body?.peerId === "string" ? req.body.peerId : "";
  if (!peerId || !touchPeer(sessionId, peerId)) {
    res.status(404).json({ error: "peerId is not joined to this session" });
    return;
  }
  res.json({ ok: true });
});

export default router;
