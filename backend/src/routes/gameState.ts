import { Router, type Request, type Response } from "express";
import { GameState } from "../components/gameState.js";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { JobRepository } from "../lib/jobRepository.js";
import { NotificationService } from "../lib/notificationService.js";
import { SessionAllowlistRepository } from "../lib/sessionAllowlistRepository.js";
import {
  canAccessSession,
  isSessionHost,
  normalizeEmail,
  parseVisibility,
} from "../lib/sessionAccess.js";

const router = Router();
const repo = new GameStateRepository();
const jobRepo = new JobRepository();
const notificationService = new NotificationService();
const allowlistRepo = new SessionAllowlistRepository();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

async function loadAccessibleSession(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<GameState | null> {
  const state = await repo.findById(sessionId);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return null;
  }
  const allowed = await canAccessSession(req.user, state, allowlistRepo);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return state;
}

function requireHost(req: Request, res: Response, state: GameState): boolean {
  if (!isSessionHost(req.user, state)) {
    res.status(403).json({ error: "Only the session host can do that" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------
// POST /api/game-state  —  Create a new game session
// ---------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  const { label, visibility: visibilityRaw } = req.body as {
    label?: string;
    visibility?: string;
  };
  const visibility = parseVisibility(visibilityRaw);
  if (!visibility) {
    res.status(400).json({ error: "visibility must be 'public' or 'private'" });
    return;
  }

  const state = await repo.create(label, {
    visibility,
    createdBySub: req.user?.sub ?? "",
    createdByEmail: normalizeEmail(req.user?.email),
  });
  if (req.user?.email) {
    state.metadata = { ...state.metadata, hostEmail: normalizeEmail(req.user.email) };
    await repo.save(state);
  }
  res.status(201).json(state.toJSON());
});

// ---------------------------------------------------------------
// GET /api/game-state  —  List sessions (newest activity first)
// ---------------------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  try {
    const sessions = await repo.findAll();
    const visible: GameState[] = [];
    for (const session of sessions) {
      if (await canAccessSession(req.user, session, allowlistRepo)) {
        visible.push(session);
      }
    }
    res.json(visible.map((s) => s.toJSON()));
  } catch (err) {
    console.error("GET /api/game-state failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to list sessions" });
    }
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId  —  Retrieve a session
// ---------------------------------------------------------------
router.get("/:sessionId", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId  —  End a session
// ---------------------------------------------------------------
router.delete("/:sessionId", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;

  state.end();
  await repo.save(state);
  res.json({ sessionId: state.sessionId, isActive: false });
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/resume  —  Restore an archived session
// ---------------------------------------------------------------
router.post("/:sessionId/resume", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;

  state.resume();
  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/players  —  Add a player
// ---------------------------------------------------------------
router.post("/:sessionId/players", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;

  const { displayName, isHost } = req.body as {
    displayName?: string;
    isHost?: boolean;
  };

  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  // First joiner on a public session may adopt host; otherwise only the
  // durable creator / current host identity may claim host.
  const wantHost =
    (!state.hostId &&
      (isSessionHost(req.user, state) || state.visibility === "public")) ||
    (Boolean(isHost) && isSessionHost(req.user, state));

  const player = state.addPlayer(displayName, wantHost);
  player.bluekeySub = req.user?.sub ?? null;
  player.bluekeyEmail = normalizeEmail(req.user?.email) || null;

  if (player.isHost && req.user?.email) {
    state.metadata = { ...state.metadata, hostEmail: normalizeEmail(req.user.email) };
  }
  // Announce joins through the same chat surface so every client (Unity and
  // dashboard) sees the newcomer in their text box without extra polling.
  state.addSystemMessage(`${displayName} joined the session`);
  await repo.save(state);
  res.status(201).json(player);
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId/players/:playerId  —  Remove a player
// ---------------------------------------------------------------
router.delete("/:sessionId/players/:playerId", async (req: Request, res: Response) => {
  const sessionId = param(req, "sessionId");
  const playerId = param(req, "playerId");

  const state = await loadAccessibleSession(req, res, sessionId);
  if (!state) return;

  const removed = state.removePlayer(playerId);
  if (!removed) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json({ removed: true });
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/visibility  —  Host flips Public/Private
// ---------------------------------------------------------------
router.patch("/:sessionId/visibility", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!requireHost(req, res, state)) return;

  const visibility = parseVisibility((req.body as { visibility?: string }).visibility);
  if (!visibility) {
    res.status(400).json({ error: "visibility must be 'public' or 'private'" });
    return;
  }

  state.visibility = visibility;
  state.updatedAt = new Date().toISOString();
  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// Allowlist CRUD (host only)
// ---------------------------------------------------------------
router.get("/:sessionId/allowlist", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;
  const entries = await allowlistRepo.list(state.sessionId);
  res.json(entries);
});

router.post("/:sessionId/allowlist", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!requireHost(req, res, state)) return;

  const { email, subjectSub } = req.body as { email?: string; subjectSub?: string };
  try {
    const entry = await allowlistRepo.add({
      sessionId: state.sessionId,
      email,
      subjectSub,
      addedBySub: req.user?.sub ?? null,
      addedByEmail: req.user?.email ?? null,
    });
    res.status(201).json(entry);
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
    res.status(statusCode).json({
      error: err instanceof Error ? err.message : "Failed to add allowlist entry",
    });
  }
});

router.delete("/:sessionId/allowlist/:entryId", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!requireHost(req, res, state)) return;

  const removed = await allowlistRepo.remove(state.sessionId, param(req, "entryId"));
  if (!removed) {
    res.status(404).json({ error: "Allowlist entry not found" });
    return;
  }
  res.json({ removed: true });
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/invite  —  Email invite via Bluekey
// ---------------------------------------------------------------
router.post("/:sessionId/invite", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const state = await repo.findById(sessionId);
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!requireHost(req, res, state)) return;

    const { email, recipientEmail, addToAllowlist } = req.body as {
      email?: string;
      recipientEmail?: string;
      addToAllowlist?: boolean;
    };
    const to = (recipientEmail ?? email ?? "").trim();
    if (!to) {
      res.status(400).json({ error: "recipientEmail is required" });
      return;
    }

    let allowlistEntry = null;
    if (addToAllowlist === true) {
      allowlistEntry = await allowlistRepo.add({
        sessionId,
        email: to,
        addedBySub: req.user?.sub ?? null,
        addedByEmail: req.user?.email ?? null,
      });
    }

    const notification = await notificationService.sendInvite({
      sessionId,
      recipientEmail: to,
      invitedBy: req.user?.email ?? "A Vellum Rift host",
      invitedById: req.user?.sub ?? null,
    });

    res.status(201).json({ ...notification, allowlistEntry });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Failed to send invite";
    if (statusCode >= 500) {
      console.error("POST /api/game-state/:sessionId/invite failed:", err);
    }
    if (!res.headersSent) {
      res.status(statusCode).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/processing-status
//   Return aggregate processing progress for all models in a session.
// ---------------------------------------------------------------
router.get("/:sessionId/processing-status", async (req: Request, res: Response) => {
  const sessionId = param(req, "sessionId");
  const state = await loadAccessibleSession(req, res, sessionId);
  if (!state) return;

  try {
    const status = await jobRepo.getSessionProcessingStatus(sessionId);
    res.json(status);
  } catch (err) {
    console.error(`GET /api/game-state/${sessionId}/processing-status failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch processing status" });
    }
  }
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/position  —  Update a player's position
// ---------------------------------------------------------------
router.patch("/:sessionId/position", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { playerId, position } = req.body as {
    playerId?: string;
    position?: { x: number; y: number; z: number };
  };

  if (!playerId || !position) {
    res.status(400).json({ error: "playerId and position are required" });
    return;
  }

  const updated = state.updatePosition(playerId, position);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/rotation  —  Update a player's rotation
// ---------------------------------------------------------------
router.patch("/:sessionId/rotation", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { playerId, rotation } = req.body as {
    playerId?: string;
    rotation?: { x: number; y: number; z: number };
  };

  if (!playerId || !rotation) {
    res.status(400).json({ error: "playerId and rotation are required" });
    return;
  }

  const updated = state.updateRotation(playerId, rotation);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/host  —  Transfer host authority
// ---------------------------------------------------------------
router.patch("/:sessionId/host", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { playerId } = req.body as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: "playerId is required" });
    return;
  }

  const updated = state.setHost(playerId);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/connection  —  Set player connection status
// ---------------------------------------------------------------
router.patch("/:sessionId/connection", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { playerId, connected } = req.body as {
    playerId?: string;
    connected?: boolean;
  };

  if (!playerId || connected === undefined) {
    res.status(400).json({ error: "playerId and connected are required" });
    return;
  }

  const updated = state.setConnected(playerId, connected);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/laser
//   Write laser state for a participant. Body: { playerId, active, origin, direction }
// ---------------------------------------------------------------
router.patch("/:sessionId/laser", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const { playerId, active, origin, direction } = req.body as {
      playerId?: string; active?: boolean;
      origin?: { x: number; y: number; z: number };
      direction?: { dx: number; dy: number; dz: number };
    };

    if (!playerId || typeof active !== "boolean") {
      res.status(400).json({ error: "playerId and active (boolean) are required" });
      return;
    }

    const player = state.getPlayer(playerId);
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    player.laserActive = active;
    if (active && origin && direction) {
      player.laserOrigin = { x: origin.x, y: origin.y, z: origin.z };
      player.laserDirection = { dx: direction.dx, dy: direction.dy, dz: direction.dz };
    }

    await repo.save(state);
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH laser failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to update laser" });
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/lasers
//   Return all active lasers. Color: host=red, others=green.
// ---------------------------------------------------------------
router.get("/:sessionId/lasers", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const lasers = state.players
      .filter((p) => p.laserActive && p.isConnected)
      .map((p) => ({
        userId: p.id,
        active: true,
        origin: p.laserOrigin,
        direction: p.laserDirection,
        color: p.id === state.hostId ? "red" : "green",
      }));

    res.json(lasers);
  } catch (err) {
    console.error("GET lasers failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch lasers" });
  }
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/summon
//   Host-only summon trigger. Body: { playerId }
// ---------------------------------------------------------------
router.post("/:sessionId/summon", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) { res.status(400).json({ error: "playerId is required" }); return; }
    if (playerId !== state.hostId) { res.status(403).json({ error: "Only the host can summon" }); return; }

    const host = state.getPlayer(playerId);
    if (!host) { res.status(400).json({ error: "Host player not found" }); return; }

    const COUNTDOWN_SECONDS = 5;
    const others = state.players.filter((p) => p.id !== host.id && p.isConnected);
    const ringRadius = 1.5;
    const count = Math.max(others.length, 1);

    // Assign every other player a unique slot in a ring around the host so
    // nobody lands on top of the summoning player.
    const slots: Record<string, { x: number; y: number; z: number }> = {};
    others.forEach((p, i) => {
      const angle = (i / count) * Math.PI * 2;
      slots[p.id] = {
        x: host.position.x + Math.cos(angle) * ringRadius,
        y: host.position.y,
        z: host.position.z + Math.sin(angle) * ringRadius,
      };
    });

    state.metadata.summon = {
      triggerAt: new Date().toISOString(),
      targetX: host.position.x,
      targetY: host.position.y,
      targetZ: host.position.z,
      slots,
    };

    await repo.save(state);

    // Return assigned slot for each player.
    res.json({
      ok: true,
      playerTargets: slots,
      summon: {
        targetX: host.position.x, targetY: host.position.y, targetZ: host.position.z,
        countdownSeconds: COUNTDOWN_SECONDS,
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("POST summon failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to trigger summon" });
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/summon
//   Poll current summon state. Returns { active, completed, targetX/Y/Z, remainingMs }
// ---------------------------------------------------------------
router.get("/:sessionId/summon", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const requestingPlayerId = typeof req.query.playerId === "string" ? req.query.playerId : "";
    const summon = state.metadata.summon as {
      triggerAt?: string;
      targetX?: number;
      targetY?: number;
      targetZ?: number;
      slots?: Record<string, { x: number; y: number; z: number }>;
    } | undefined;
    const COUNTDOWN_MS = 5000;

    if (!summon?.triggerAt) { res.json({ active: false }); return; }

    const elapsed = Date.now() - new Date(summon.triggerAt).getTime();
    const remainingMs = Math.max(0, COUNTDOWN_MS - elapsed);

    // Use this player's ring slot when available, else the host position.
    const slot = summon.slots?.[requestingPlayerId];
    const targetX = slot?.x ?? summon.targetX ?? 0;
    const targetY = slot?.y ?? summon.targetY ?? 0;
    const targetZ = slot?.z ?? summon.targetZ ?? 0;

    if (remainingMs <= 0) {
      state.metadata.summon = undefined;
      await repo.save(state);
      res.json({ active: false, completed: true, targetX, targetY, targetZ });
      return;
    }

    res.json({ active: true, targetX, targetY, targetZ, countdownSeconds: 5, triggeredAt: summon.triggerAt, remainingMs });
  } catch (err) {
    console.error("GET summon failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch summon state" });
  }
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId/summon
//   Host-only cancel. Body: { playerId }
// ---------------------------------------------------------------
router.delete("/:sessionId/summon", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) { res.status(400).json({ error: "playerId is required" }); return; }
    if (playerId !== state.hostId) { res.status(403).json({ error: "Only the host can cancel summon" }); return; }

    state.metadata.summon = undefined;
    await repo.save(state);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE summon failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to cancel summon" });
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/chat
//   Return persisted text messages for a session, oldest first.
// ---------------------------------------------------------------
router.get("/:sessionId/chat", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    res.json({ messages: state.getChatMessages() });
  } catch (err) {
    console.error("GET chat failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/chat
//   Post a text chat message. Body: { playerId, text }
// ---------------------------------------------------------------
router.post("/:sessionId/chat", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const { playerId, text } = req.body as { playerId?: string; text?: string };
    if (!playerId || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "playerId and non-empty text are required" });
      return;
    }
    // Cap message size so session metadata can't be ballooned toward the
    // Postgres JSONB value limit (security review).
    if (text.trim().length > 2000) {
      res.status(400).json({ error: "text must be 2000 characters or fewer" });
      return;
    }

    const message = state.addChatMessage(playerId, text.trim());
    if (!message) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    await repo.save(state);
    res.status(201).json({ messages: state.getChatMessages(), message });
  } catch (err) {
    console.error("POST chat failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to post chat" });
  }
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/artifacts
//   Create a spatial artifact (waypoint/pin). Body: { artifactType, label, x, y, z, createdBy }
// ---------------------------------------------------------------
router.post("/:sessionId/artifacts", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const { artifactType, label, x, y, z, createdBy } = req.body as {
      artifactType?: string; label?: string; x?: number; y?: number; z?: number; createdBy?: string;
    };

    if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
      res.status(400).json({ error: "x, y, z (numbers) are required" });
      return;
    }
    // Cap artifact metadata size (security review).
    if (label && String(label).length > 256) {
      res.status(400).json({ error: "label must be 256 characters or fewer" });
      return;
    }

    const artifacts: Record<string, unknown>[] = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];

    // Cap artifact count (security review).
    if (artifacts.length >= 500) {
      res.status(400).json({ error: "Maximum of 500 artifacts per session" });
      return;
    }

    const now = new Date().toISOString();
    const artifact = {
      id: crypto.randomUUID(),
      artifactType: artifactType ?? "waypoint",
      label: label ?? "",
      x, y, z,
      createdBy: createdBy ?? "",
      createdAt: now,
      updatedAt: now,
    };
    artifacts.push(artifact);
    state.metadata.artifacts = artifacts;

    await repo.save(state);
    res.status(201).json(artifact);
  } catch (err) {
    console.error("POST artifact failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to create artifact" });
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/artifacts
//   List all artifacts for a session.
// ---------------------------------------------------------------
router.get("/:sessionId/artifacts", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const artifacts = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];
    res.json(artifacts);
  } catch (err) {
    console.error("GET artifacts failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch artifacts" });
  }
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/artifacts/:artifactId
//   Update an artifact's label or position.
// ---------------------------------------------------------------
router.patch("/:sessionId/artifacts/:artifactId", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const artifactId = param(req, "artifactId");
    const artifacts = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];
    const idx = artifacts.findIndex((a: any) => a.id === artifactId);
    if (idx === -1) { res.status(404).json({ error: "Artifact not found" }); return; }

    const { label, x, y, z } = req.body as { label?: string; x?: number; y?: number; z?: number };
    if (label === undefined && x === undefined && y === undefined && z === undefined) {
      res.status(400).json({ error: "At least one field (label, x, y, z) is required" });
      return;
    }

    const artifact = { ...artifacts[idx] } as Record<string, unknown>;
    if (label !== undefined) artifact.label = label;
    if (x !== undefined) artifact.x = x;
    if (y !== undefined) artifact.y = y;
    if (z !== undefined) artifact.z = z;
    artifact.updatedAt = new Date().toISOString();
    artifacts[idx] = artifact;
    state.metadata.artifacts = artifacts;

    await repo.save(state);
    res.json(artifact);
  } catch (err) {
    console.error("PATCH artifact failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to update artifact" });
  }
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId/artifacts/:artifactId
//   Remove an artifact.
// ---------------------------------------------------------------
router.delete("/:sessionId/artifacts/:artifactId", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) { res.status(404).json({ error: "Session not found" }); return; }

    const artifactId = param(req, "artifactId");
    const artifacts = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];
    const idx = artifacts.findIndex((a: any) => a.id === artifactId);
    if (idx === -1) { res.status(404).json({ error: "Artifact not found" }); return; }

    artifacts.splice(idx, 1);
    state.metadata.artifacts = artifacts;

    await repo.save(state);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE artifact failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to delete artifact" });
  }
});

export default router;
