import { Router, type Request, type Response } from "express";
import { GameState } from "../components/gameState.js";

const router = Router();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// In-memory session store (will be replaced by a database layer later).
const sessions = new Map<string, GameState>();

// ---------------------------------------------------------------
// POST /api/game-state  —  Create a new game session
// ---------------------------------------------------------------
router.post("/", (req: Request, res: Response) => {
  const { label } = req.body as { label?: string };
  const state = new GameState(label);

  sessions.set(state.sessionId, state);

  res.status(201).json(state.toJSON());
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId  —  Retrieve a session
// ---------------------------------------------------------------
router.get("/:sessionId", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId  —  End a session
// ---------------------------------------------------------------
router.delete("/:sessionId", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  state.end();
  res.json({ sessionId: state.sessionId, isActive: false });
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/players  —  Add a player
// ---------------------------------------------------------------
router.post("/:sessionId/players", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { displayName, isHost } = req.body as {
    displayName?: string;
    isHost?: boolean;
  };

  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  const player = state.addPlayer(displayName, isHost ?? false);
  res.status(201).json(player);
});

// ---------------------------------------------------------------
// DELETE /api/game-state/:sessionId/players/:playerId  —  Remove a player
// ---------------------------------------------------------------
router.delete("/:sessionId/players/:playerId", (req: Request, res: Response) => {
  const sessionId = param(req, "sessionId");
  const playerId = param(req, "playerId");

  const state = sessions.get(sessionId);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const removed = state.removePlayer(playerId);
  if (!removed) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json({ removed: true });
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/position  —  Update a player's position
// ---------------------------------------------------------------
router.patch("/:sessionId/position", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
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

  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/rotation  —  Update a player's rotation
// ---------------------------------------------------------------
router.patch("/:sessionId/rotation", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
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

  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/host  —  Transfer host authority
// ---------------------------------------------------------------
router.patch("/:sessionId/host", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
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

  res.json(state.toJSON());
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/connection  —  Set player connection status
// ---------------------------------------------------------------
router.patch("/:sessionId/connection", (req: Request, res: Response) => {
  const state = sessions.get(param(req, "sessionId"));
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

  res.json(state.toJSON());
});

export default router;