import { Router, type Request, type Response } from "express";
import { GameState } from "../components/gameState.js";
import { isKioskGuest } from "../lib/auth.js";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { GlTFModelRepository } from "../lib/gltfModelRepository.js";
import { JobRepository } from "../lib/jobRepository.js";
import { NotificationService } from "../lib/notificationService.js";
import { SessionAllowlistRepository } from "../lib/sessionAllowlistRepository.js";
import { SessionModerationRepository } from "../lib/sessionModerationRepository.js";
import {
  applyActiveModelPatch,
  applyPlaylistPatch,
  readPlaylist,
  writePlaylist,
} from "../lib/sessionPlaylist.js";
import {
  applyStagePatch,
  guestsMaySwitch,
  readStage,
  seedPlacementsForLayout,
} from "../lib/sessionStage.js";
import {
  applyModelPlacementsPatch,
  reconcileSelectedModel,
  readModelPlacements,
  syncPlacementsWithPlaylist,
  writeModelPlacements,
} from "../lib/sessionModelPlacements.js";
import {
  canAccessSession,
  isSessionHost,
  normalizeEmail,
  parseVisibility,
} from "../lib/sessionAccess.js";
import { writeKioskEnabled } from "../lib/sessionKiosk.js";
import {
  applyEventPatch,
  parseSessionKind,
  writeSessionEvent,
} from "../lib/sessionEvent.js";
import { checkRateLimit } from "../lib/kioskRateLimit.js";
import {
  pruneStalePlayers,
  touchPlayerPresence,
} from "../lib/sessionPresence.js";

const router = Router();
const repo = new GameStateRepository();
const modelRepo = new GlTFModelRepository();
const jobRepo = new JobRepository();
const notificationService = new NotificationService();
const allowlistRepo = new SessionAllowlistRepository();
const moderationRepo = new SessionModerationRepository();

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
  if (pruneStalePlayers(state)) {
    await repo.save(state);
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

/** Block museum kiosk guests from host/admin mutations (#145). */
function rejectKioskGuest(req: Request, res: Response): boolean {
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot do that" });
    return true;
  }
  return false;
}

/** Sanitize nametag for kiosk / public join (#255 — strip markup / XSS chars). */
function sanitizeDisplayName(raw: string | undefined, kiosk: boolean): string {
  const maxLen = kiosk ? 20 : 40;
  const cleaned = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>&"'`\\/]/g, "")
    .trim()
    .slice(0, maxLen);
  if (cleaned) return cleaned;
  return kiosk ? "Guest" : "";
}

/** True when the caller owns the given player row (Bluekey or kiosk sub). */
function ownsPlayer(
  state: GameState,
  user: Request["user"],
  playerId: string,
): boolean {
  if (!user) return false;
  const target = state.getPlayer(playerId);
  if (!target) return false;
  if (user.sub && target.bluekeySub && target.bluekeySub === user.sub) {
    return true;
  }
  const email = normalizeEmail(user.email);
  if (email && normalizeEmail(target.bluekeyEmail) === email) {
    return true;
  }
  return false;
}

/**
 * Reject player-state mutations that target another participant (#259).
 * Returns false after sending 404/403 when the body playerId is missing or foreign.
 */
function requireOwnPlayer(
  req: Request,
  res: Response,
  state: GameState,
  playerId: string,
): boolean {
  if (!state.getPlayer(playerId)) {
    res.status(404).json({ error: "Player not found" });
    return false;
  }
  if (ownsPlayer(state, req.user, playerId)) return true;
  res.status(403).json({ error: "You can only update your own player" });
  return false;
}

/**
 * Session JSON for the caller. Kiosk guests never see host/creator PII (#251).
 */
function serializeSession(
  state: GameState,
  user: Request["user"],
): Record<string, unknown> {
  const json = state.toJSON();
  if (!isKioskGuest(user)) return json;

  json.createdByEmail = "";
  json.createdBySub = "";
  const metadata = { ...(json.metadata as Record<string, unknown>) };
  delete metadata.hostEmail;
  json.metadata = metadata;
  json.players = state.players.map((p) => ({
    ...p,
    bluekeySub: null,
    bluekeyEmail: null,
  }));
  return json;
}

/** Player row for the authenticated user in this session, if any. */
function resolveRequestPlayerId(
  state: GameState,
  user: Request["user"],
): string | null {
  if (!user) return null;
  const email = normalizeEmail(user.email);
  for (const p of state.players) {
    if (user.sub && p.bluekeySub && p.bluekeySub === user.sub) return p.id;
    if (email && normalizeEmail(p.bluekeyEmail) === email) return p.id;
  }
  return null;
}

type ArtifactRecord = Record<string, unknown> & {
  id?: string;
  createdBy?: string;
  label?: string;
};

/** Creator or session host may mutate an artifact (#163). */
function canModifyArtifact(
  state: GameState,
  user: Request["user"],
  artifact: ArtifactRecord,
): boolean {
  if (isSessionHost(user, state)) return true;
  const requestPlayerId = resolveRequestPlayerId(state, user);
  if (!requestPlayerId) return false;
  const owner = String(artifact.createdBy ?? "");
  if (!owner) return false;
  return owner === requestPlayerId;
}

/** Ensure every model id exists in gltf_models. */
async function assertModelsExist(
  res: Response,
  modelIds: string[],
): Promise<boolean> {
  for (const modelId of modelIds) {
    const record = await modelRepo.findById(modelId);
    if (!record) {
      res.status(400).json({ error: `Unknown modelId: ${modelId}` });
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------
// POST /api/game-state  —  Create a new game session
// ---------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  if (rejectKioskGuest(req, res)) return;

  const { label, visibility: visibilityRaw, kind: kindRaw } = req.body as {
    label?: string;
    visibility?: string;
    kind?: string;
  };
  const visibility = parseVisibility(visibilityRaw);
  if (!visibility) {
    res.status(400).json({ error: "visibility must be 'public' or 'private'" });
    return;
  }

  let kind = parseSessionKind(kindRaw);
  if (kindRaw !== undefined && !kind) {
    res.status(400).json({ error: "kind must be 'exploration' or 'event'" });
    return;
  }
  kind = kind ?? "exploration";

  const state = await repo.create(label, {
    visibility,
    createdBySub: req.user?.sub ?? "",
    createdByEmail: normalizeEmail(req.user?.email),
  });
  let metadata = { ...state.metadata };
  if (req.user?.email) {
    metadata = { ...metadata, hostEmail: normalizeEmail(req.user.email) };
  }
  if (kind === "event") {
    metadata = writeSessionEvent(metadata, {
      kind: "event",
      startsAt: null,
      endsAt: null,
    });
  }
  state.metadata = metadata;
  await repo.save(state);
  res.status(201).json(serializeSession(state, req.user));
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
        if (pruneStalePlayers(session)) {
          await repo.save(session);
        }
        visible.push(session);
      }
    }
    res.json(visible.map((s) => serializeSession(s, req.user)));
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
  res.json(serializeSession(state, req.user));
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
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// POST /api/game-state/:sessionId/players  —  Add a player
// ---------------------------------------------------------------
router.post("/:sessionId/players", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;

  const kiosk = isKioskGuest(req.user);
  if (kiosk && req.user?.kioskSessionId !== state.sessionId) {
    res.status(403).json({ error: "Kiosk token does not match this space" });
    return;
  }

  const banned = await moderationRepo.isBanned(state.sessionId, {
    sub: req.user?.sub,
    email: req.user?.email,
  });
  if (banned) {
    res.status(403).json({ error: "You are banned from this session" });
    return;
  }

  const { displayName: rawName, isHost } = req.body as {
    displayName?: string;
    isHost?: boolean;
  };

  const displayName = sanitizeDisplayName(rawName, kiosk);
  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  // Kiosk guests never become host. First joiner on a public session may
  // adopt host; otherwise only the durable creator / current host identity.
  const wantHost =
    !kiosk &&
    ((!state.hostId &&
      (isSessionHost(req.user, state) || state.visibility === "public")) ||
      (Boolean(isHost) && isSessionHost(req.user, state)));

  const player = state.addPlayer(displayName, wantHost);
  player.bluekeySub = req.user?.sub ?? null;
  player.bluekeyEmail = normalizeEmail(req.user?.email) || null;
  player.chatMuted = false;

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

  const target = state.getPlayer(playerId);
  if (!target) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const host = isSessionHost(req.user, state);
  const self =
    Boolean(req.user?.sub && target.bluekeySub && target.bluekeySub === req.user.sub) ||
    Boolean(
      normalizeEmail(req.user?.email) &&
        normalizeEmail(target.bluekeyEmail) === normalizeEmail(req.user?.email),
    );
  if (!host && !self) {
    res.status(403).json({ error: "You can only remove yourself" });
    return;
  }

  const removed = state.removePlayer(playerId);
  if (!removed) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json({ removed: true });
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/kiosk — Host enables museum public join (#145)
// ---------------------------------------------------------------
router.patch("/:sessionId/kiosk", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!requireHost(req, res, state)) return;

  const enabled = (req.body as { enabled?: unknown }).enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  state.metadata = writeKioskEnabled(state.metadata, enabled);
  state.updatedAt = new Date().toISOString();
  await repo.save(state);
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/event — Host sets kind / schedule (#146)
// Body: { kind?: 'exploration'|'event', startsAt?: string|null, endsAt?: string|null }
// ---------------------------------------------------------------
router.patch("/:sessionId/event", async (req: Request, res: Response) => {
  const state = await repo.findById(param(req, "sessionId"));
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!requireHost(req, res, state)) return;

  const body = req.body as {
    kind?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
  };
  if (
    body.kind === undefined &&
    body.startsAt === undefined &&
    body.endsAt === undefined
  ) {
    res.status(400).json({
      error: "Provide kind, startsAt, and/or endsAt",
    });
    return;
  }

  const patched = applyEventPatch(state.metadata, body);
  if (!patched.ok) {
    res.status(400).json({ error: patched.error });
    return;
  }

  state.metadata = patched.metadata;
  state.updatedAt = new Date().toISOString();
  await repo.save(state);
  res.json(serializeSession(state, req.user));
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
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/playlist  —  Host mutates manuscript set (#141)
// Body: { playlist?: string[], append?: string|string[], remove?: string|string[],
//         activeModelId?: string|null }
// ---------------------------------------------------------------
router.patch("/:sessionId/playlist", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!requireHost(req, res, state)) return;

    const body = req.body as {
      playlist?: unknown;
      append?: unknown;
      remove?: unknown;
      activeModelId?: unknown;
    };
    if (
      body.playlist === undefined &&
      body.append === undefined &&
      body.remove === undefined &&
      body.activeModelId === undefined
    ) {
      res.status(400).json({
        error: "Provide playlist, append, remove, and/or activeModelId",
      });
      return;
    }

    const patched = applyPlaylistPatch(state.metadata, body);
    if (!patched.ok) {
      res.status(patched.statusCode).json({ error: patched.error });
      return;
    }

    if (!(await assertModelsExist(res, patched.state.playlist))) return;

    const prevPlaylist = readPlaylist(state.metadata).playlist;
    const prevPlacements = readModelPlacements(state.metadata, prevPlaylist);
    const { stageLayout } = readStage(state.metadata);

    let metadata = writePlaylist(state.metadata, patched.state);
    const seeds =
      stageLayout === "custom"
        ? undefined
        : seedPlacementsForLayout(patched.state.playlist, stageLayout);
    const modelPlacements = syncPlacementsWithPlaylist(
      patched.state.playlist,
      stageLayout === "custom" ? prevPlacements.modelPlacements : {},
      seeds,
    );

    // Prefer newly appended model as the placement selection (#167).
    let selectedModelId = prevPlacements.selectedModelId;
    if (body.append !== undefined) {
      const appended = Array.isArray(body.append)
        ? body.append.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : typeof body.append === "string" && body.append.trim()
          ? [body.append.trim()]
          : [];
      if (appended.length) selectedModelId = appended[appended.length - 1]!.trim();
    }
    selectedModelId = reconcileSelectedModel(patched.state.playlist, selectedModelId);
    metadata = writeModelPlacements(metadata, { selectedModelId, modelPlacements });

    state.metadata = metadata;
    state.updatedAt = new Date().toISOString();
    await repo.save(state);
    await modelRepo.syncSessionPlaylist(state.sessionId, patched.state.playlist);
    res.json(serializeSession(state, req.user));
  } catch (err) {
    console.error("PATCH /api/game-state/:sessionId/playlist failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to update playlist" });
    }
  }
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/active-model  —  Host sets active manuscript (#141)
// Guests may switch when guestExperience is browse|open_stage (#243).
// Body: { modelId: string | null }
// ---------------------------------------------------------------
router.patch("/:sessionId/active-model", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const isHost = isSessionHost(req.user, state);
    if (!isHost) {
      const { guestExperience } = readStage(state.metadata);
      if (!guestsMaySwitch(guestExperience)) {
        res.status(403).json({ error: "Only the session host can do that" });
        return;
      }
    }

    const { modelId } = req.body as { modelId?: unknown };
    if (modelId === undefined) {
      res.status(400).json({ error: "modelId is required (string or null)" });
      return;
    }

    const patched = applyActiveModelPatch(state.metadata, modelId);
    if (!patched.ok) {
      res.status(patched.statusCode).json({ error: patched.error });
      return;
    }

    if (patched.state.activeModelId) {
      if (!(await assertModelsExist(res, [patched.state.activeModelId]))) return;
    }

    state.metadata = writePlaylist(state.metadata, patched.state);
    state.updatedAt = new Date().toISOString();
    await repo.save(state);
    res.json(serializeSession(state, req.user));
  } catch (err) {
    console.error("PATCH /api/game-state/:sessionId/active-model failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to update active model" });
    }
  }
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/stage — host sets layout + guest experience (#243)
// Body: { stageLayout?, guestExperience? }
// ---------------------------------------------------------------
router.patch("/:sessionId/stage", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!requireHost(req, res, state)) return;

    const body = req.body as { stageLayout?: unknown; guestExperience?: unknown };
    if (body.stageLayout === undefined && body.guestExperience === undefined) {
      res.status(400).json({ error: "Provide stageLayout and/or guestExperience" });
      return;
    }

    const patched = applyStagePatch(state.metadata, body);
    if (!patched.ok) {
      res.status(patched.statusCode).json({ error: patched.error });
      return;
    }

    state.metadata = patched.metadata;
    state.updatedAt = new Date().toISOString();
    await repo.save(state);
    res.json(serializeSession(state, req.user));
  } catch (err) {
    console.error("PATCH /api/game-state/:sessionId/stage failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to update stage" });
    }
  }
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/model-placements — host transforms (#167 / #243 custom)
// Body: { placements?, selectedModelId?, remove? }
// ---------------------------------------------------------------
router.patch("/:sessionId/model-placements", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!requireHost(req, res, state)) return;

    const body = req.body as {
      placements?: unknown;
      selectedModelId?: unknown;
      remove?: unknown;
    };
    if (
      body.placements === undefined &&
      body.selectedModelId === undefined &&
      body.remove === undefined
    ) {
      res.status(400).json({
        error: "Provide placements, selectedModelId, and/or remove",
      });
      return;
    }

    const { playlist } = readPlaylist(state.metadata);
    const patched = applyModelPlacementsPatch(state.metadata, playlist, body);
    if (!patched.ok) {
      res.status(patched.statusCode).json({ error: patched.error });
      return;
    }

    // Custom transforms imply custom stage layout so preset reseeds do not wipe them.
    let metadata = writeModelPlacements(state.metadata, patched.state);
    if (body.placements !== undefined && readStage(metadata).stageLayout !== "custom") {
      const custom = applyStagePatch(metadata, { stageLayout: "custom" });
      if (custom.ok) {
        metadata = writeModelPlacements(custom.metadata, patched.state);
      }
    }

    state.metadata = metadata;
    state.updatedAt = new Date().toISOString();
    await repo.save(state);
    res.json(serializeSession(state, req.user));
  } catch (err) {
    console.error("PATCH /api/game-state/:sessionId/model-placements failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to update model placements" });
    }
  }
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
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;

  const { playerId, position } = req.body as {
    playerId?: string;
    position?: { x: number; y: number; z: number };
  };

  if (!playerId || !position) {
    res.status(400).json({ error: "playerId and position are required" });
    return;
  }
  if (!requireOwnPlayer(req, res, state, playerId)) return;

  const updated = state.updatePosition(playerId, position);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/rotation  —  Update a player's rotation
// ---------------------------------------------------------------
router.patch("/:sessionId/rotation", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;

  const { playerId, rotation } = req.body as {
    playerId?: string;
    rotation?: { x: number; y: number; z: number };
  };

  if (!playerId || !rotation) {
    res.status(400).json({ error: "playerId and rotation are required" });
    return;
  }
  if (!requireOwnPlayer(req, res, state, playerId)) return;

  const updated = state.updateRotation(playerId, rotation);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/host  —  Transfer host authority
// ---------------------------------------------------------------
router.patch("/:sessionId/host", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;

  const { playerId } = req.body as { playerId?: string };
  if (!playerId) {
    res.status(400).json({ error: "playerId is required" });
    return;
  }

  const target = state.getPlayer(playerId);
  if (!target) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  if (target.id === state.hostId) {
    res.json(serializeSession(state, req.user));
    return;
  }

  const updated = state.setHost(playerId);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  state.addSystemMessage(`${target.displayName} is now the session host`);
  await moderationRepo.recordEvent({
    sessionId: state.sessionId,
    action: "transfer_host",
    actorSub: req.user?.sub,
    actorEmail: req.user?.email,
    targetPlayerId: target.id,
    targetSub: target.bluekeySub,
    targetEmail: target.bluekeyEmail,
  });
  await repo.save(state);
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// POST .../players/:playerId/kick — remove + ban rejoin (host only)
// ---------------------------------------------------------------
router.post("/:sessionId/players/:playerId/kick", async (req: Request, res: Response) => {
  try {
    const sessionId = param(req, "sessionId");
    const playerId = param(req, "playerId");
    const state = await loadAccessibleSession(req, res, sessionId);
    if (!state) return;
    if (!requireHost(req, res, state)) return;

    const target = state.getPlayer(playerId);
    if (!target) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    if (target.id === state.hostId || target.isHost) {
      res.status(400).json({ error: "Cannot kick the current host" });
      return;
    }

    const reason =
      typeof (req.body as { reason?: string }).reason === "string"
        ? (req.body as { reason?: string }).reason!.trim()
        : null;

    const canBan = Boolean(target.bluekeySub?.trim() || target.bluekeyEmail?.trim());
    if (canBan) {
      await moderationRepo.addBan({
        sessionId,
        subjectSub: target.bluekeySub,
        email: target.bluekeyEmail,
        playerId: target.id,
        displayName: target.displayName,
        reason,
        createdBySub: req.user?.sub,
        createdByEmail: req.user?.email,
      });
    }

    state.removePlayer(playerId);
    state.addSystemMessage(`${target.displayName} was removed from the session`);
    await moderationRepo.recordEvent({
      sessionId,
      action: "kick",
      actorSub: req.user?.sub,
      actorEmail: req.user?.email,
      targetPlayerId: target.id,
      targetSub: target.bluekeySub,
      targetEmail: target.bluekeyEmail,
      detail: { reason: reason || null, banned: canBan },
    });
    await repo.save(state);
    res.json({ kicked: true, banned: canBan, session: serializeSession(state, req.user) });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) console.error("kick failed:", err);
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: err instanceof Error ? err.message : "Failed to kick player",
      });
    }
  }
});

// ---------------------------------------------------------------
// POST .../players/:playerId/mute|unmute — chat mute (host only)
// ---------------------------------------------------------------
router.post("/:sessionId/players/:playerId/mute", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;

  const player = state.getPlayer(param(req, "playerId"));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  player.chatMuted = true;
  state.updatedAt = new Date().toISOString();
  state.addSystemMessage(`${player.displayName} was muted in chat`);
  await moderationRepo.recordEvent({
    sessionId: state.sessionId,
    action: "mute",
    actorSub: req.user?.sub,
    actorEmail: req.user?.email,
    targetPlayerId: player.id,
    targetSub: player.bluekeySub,
    targetEmail: player.bluekeyEmail,
  });
  await repo.save(state);
  res.json({ muted: true, player });
});

router.post("/:sessionId/players/:playerId/unmute", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;
  if (!requireHost(req, res, state)) return;

  const player = state.getPlayer(param(req, "playerId"));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  player.chatMuted = false;
  state.updatedAt = new Date().toISOString();
  state.addSystemMessage(`${player.displayName} was unmuted in chat`);
  await moderationRepo.recordEvent({
    sessionId: state.sessionId,
    action: "unmute",
    actorSub: req.user?.sub,
    actorEmail: req.user?.email,
    targetPlayerId: player.id,
    targetSub: player.bluekeySub,
    targetEmail: player.bluekeyEmail,
  });
  await repo.save(state);
  res.json({ muted: false, player });
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/connection  —  Set player connection status
// ---------------------------------------------------------------
router.patch("/:sessionId/connection", async (req: Request, res: Response) => {
  const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
  if (!state) return;

  const { playerId, connected } = req.body as {
    playerId?: string;
    connected?: boolean;
  };

  if (!playerId || connected === undefined) {
    res.status(400).json({ error: "playerId and connected are required" });
    return;
  }
  if (!requireOwnPlayer(req, res, state, playerId)) return;

  const updated = state.setConnected(playerId, connected);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await repo.save(state);
  res.json(serializeSession(state, req.user));
});

// ---------------------------------------------------------------
// PATCH /api/game-state/:sessionId/laser
//   Write laser state for a participant. Body: { playerId, active, origin, direction }
// ---------------------------------------------------------------
router.patch("/:sessionId/laser", async (req: Request, res: Response) => {
  try {
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

    const { playerId, active, origin, direction } = req.body as {
      playerId?: string; active?: boolean;
      origin?: { x: number; y: number; z: number };
      direction?: { dx: number; dy: number; dz: number };
    };

    if (!playerId || typeof active !== "boolean") {
      res.status(400).json({ error: "playerId and active (boolean) are required" });
      return;
    }
    if (!requireOwnPlayer(req, res, state, playerId)) return;

    const player = state.getPlayer(playerId);
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }

    player.laserActive = active;
    if (active && origin && direction) {
      player.laserOrigin = { x: origin.x, y: origin.y, z: origin.z };
      player.laserDirection = { dx: direction.dx, dy: direction.dy, dz: direction.dz };
    }
    touchPlayerPresence(player);

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
// PATCH /api/game-state/:sessionId/flashlight — shared flashlight (#244)
// Body: { playerId, on, origin?, direction? }
// ---------------------------------------------------------------
router.patch("/:sessionId/flashlight", async (req: Request, res: Response) => {
  try {
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

    const { playerId, on, origin, direction } = req.body as {
      playerId?: string;
      on?: boolean;
      origin?: { x: number; y: number; z: number };
      direction?: { dx: number; dy: number; dz: number };
    };

    if (!playerId || typeof on !== "boolean") {
      res.status(400).json({ error: "playerId and on (boolean) are required" });
      return;
    }
    if (!requireOwnPlayer(req, res, state, playerId)) return;

    const player = state.getPlayer(playerId);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    player.flashlightOn = on;
    if (on && origin && direction) {
      player.flashlightOrigin = { x: origin.x, y: origin.y, z: origin.z };
      player.flashlightDirection = {
        dx: direction.dx,
        dy: direction.dy,
        dz: direction.dz,
      };
    }

    touchPlayerPresence(player);
    state.updatedAt = new Date().toISOString();
    await repo.save(state);
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH flashlight failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to update flashlight" });
  }
});

// ---------------------------------------------------------------
// GET /api/game-state/:sessionId/flashlights — all on flashlights (#244)
// ---------------------------------------------------------------
router.get("/:sessionId/flashlights", async (req: Request, res: Response) => {
  try {
    const state = await repo.findById(param(req, "sessionId"));
    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const lights = state.players
      .filter((p) => p.flashlightOn && p.isConnected)
      .map((p) => ({
        playerId: p.id,
        displayName: p.displayName,
        origin: p.flashlightOrigin ?? { x: 0, y: 0, z: 0 },
        direction: p.flashlightDirection ?? { dx: 0, dy: -0.2, dz: 1 },
      }));

    res.json(lights);
  } catch (err) {
    console.error("GET flashlights failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to fetch flashlights" });
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
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

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
    if (!requireOwnPlayer(req, res, state, playerId)) return;

    const player = state.getPlayer(playerId);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    if (player.chatMuted) {
      res.status(403).json({ error: "You are muted in this session" });
      return;
    }

    // Per-player chat flood control (#262). Shared limiter with kiosk mint.
    const chatLimit = Number(process.env.CHAT_RATE_LIMIT ?? 20);
    const chatWindowMs = Number(process.env.CHAT_RATE_WINDOW_MS ?? 60_000);
    const rateKey = `chat:${state.sessionId}:${playerId}`;
    const rate = checkRateLimit(rateKey, chatLimit, chatWindowMs);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.status(429).json({ error: "Too many chat messages; slow down" });
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
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

    const { artifactType, label, x, y, z } = req.body as {
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

    const requestPlayerId = resolveRequestPlayerId(state, req.user);
    if (!requestPlayerId) {
      res.status(403).json({ error: "Join the session as a player before placing pins" });
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
      createdBy: requestPlayerId,
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
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

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
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

    const artifactId = param(req, "artifactId");
    const artifacts = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];
    const idx = artifacts.findIndex((a: any) => a.id === artifactId);
    if (idx === -1) { res.status(404).json({ error: "Artifact not found" }); return; }

    const existing = artifacts[idx] as ArtifactRecord;
    if (!canModifyArtifact(state, req.user, existing)) {
      res.status(403).json({ error: "You can only edit your own pins" });
      return;
    }

    const { label, x, y, z } = req.body as { label?: string; x?: number; y?: number; z?: number };
    if (label === undefined && x === undefined && y === undefined && z === undefined) {
      res.status(400).json({ error: "At least one field (label, x, y, z) is required" });
      return;
    }
    if (label !== undefined && String(label).length > 256) {
      res.status(400).json({ error: "label must be 256 characters or fewer" });
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
    const state = await loadAccessibleSession(req, res, param(req, "sessionId"));
    if (!state) return;

    const artifactId = param(req, "artifactId");
    const artifacts = (state.metadata.artifacts as Record<string, unknown>[]) ?? [];
    const idx = artifacts.findIndex((a: any) => a.id === artifactId);
    if (idx === -1) { res.status(404).json({ error: "Artifact not found" }); return; }

    const existing = artifacts[idx] as ArtifactRecord;
    if (!canModifyArtifact(state, req.user, existing)) {
      res.status(403).json({ error: "You can only delete your own pins" });
      return;
    }

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
