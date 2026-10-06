import crypto from "node:crypto";
import { readPlaylist } from "../lib/sessionPlaylist.js";
import { readKioskEnabled } from "../lib/sessionKiosk.js";
import { readSessionEvent } from "../lib/sessionEvent.js";
import { readSessionRotation } from "../lib/sessionRotation.js";
import { touchPlayerSeen } from "../lib/sessionPresence.js";

/** Metadata key that stores persisted chat messages for a session. */
const CHAT_MESSAGES_KEY = "messages";

/** Metadata key for help-request history (#294). */
const HELP_REQUESTS_KEY = "helpRequests";

/** Upper bound on persisted chat history per session. */
const MAX_CHAT_MESSAGES = 200;

/** Max stored help requests (including acknowledged). */
const MAX_HELP_REQUESTS = 100;

/** Minimum seconds between help requests from the same player. */
export const HELP_REQUEST_COOLDOWN_MS = 30_000;

/**
 * Represents a single participant's spatial and session state
 * within a game session. This is the per-player subset of the
 * broader GameState.
 */
export interface PlayerState {
  id: string;
  displayName: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  isHost: boolean;
  isConnected: boolean;
  joinedAt: string;
  /** Laser pointer state (FTR-009) */
  laserActive: boolean;
  laserOrigin: { x: number; y: number; z: number };
  laserDirection: { dx: number; dy: number; dz: number };
  /** Bluekey identity stamped at join (#136). */
  bluekeySub?: string | null;
  bluekeyEmail?: string | null;
  /** Session-scoped chat mute (#137). */
  chatMuted?: boolean;
  /** Last position/laser heartbeat — used by sessionPresence prune. */
  lastSeenAt?: string;
  /** Last laser PATCH while held — lasers expire without fresh heartbeats. */
  lastLaserAt?: string;
}

export type SessionVisibility = "public" | "private";

/** A spatial artifact (waypoint/pin) within a session. */
export interface ArtifactState {
  id: string;
  artifactType: string;
  label: string;
  x: number;
  y: number;
  z: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Summon state stored in GameState.metadata. */
export interface SummonState {
  triggerAt: string | null;
  targetX: number;
  targetY: number;
  targetZ: number;
}

/** Guest "call for help" alert for the host dashboard (#294). */
export interface HelpRequestState {
  id: string;
  playerId: string;
  playerName: string;
  createdAt: string;
  acknowledgedAt?: string;
}

/** A persisted text chat message attributed to a session participant. */
export interface ChatMessageState {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  sentAt: string;
  /** True for server-generated messages (e.g. "Player joined the session"). */
  system?: boolean;
}

//describes waht the statistics object must contain
export interface GameStateStats {
  totalSessionsCreated: number;
  activeSessions: number;
  totalPlayers: number;
  connectedPlayers: number;
  orphanedSessions: number;
  avgPlayersPerActiveSession: number;
}

/**
 * The top-level game state for a single group session.
 *
 * Only data the client needs to render is stored here;
 * durable persistence is handled server-side by the database.
 */
export class GameState {
  /** Unique session identifier, generated at construction time. */
  readonly sessionId: string;

  /** Human-readable label for the session (optional). */
  label: string;

  /** ID of the participant currently hosting the session. */
  hostId: string;

  /** All participants in the session. */
  players: PlayerState[];

  /** ISO-8601 timestamp of when this session was created. */
  readonly createdAt: string;

  /** ISO-8601 timestamp of the last state change. */
  updatedAt: string;

  /** Whether the session is currently active. */
  isActive: boolean;

  /** Public = any signed-in user; private = host + allowlist (#136). */
  visibility: SessionVisibility;

  /** Durable Bluekey identity of the session creator. */
  createdBySub: string;
  createdByEmail: string;

  /** Arbitrary metadata bag for feature-specific flags. */
  metadata: Record<string, unknown>;

  constructor(label?: string) {
    this.sessionId = crypto.randomUUID();
    this.label = label ?? "";
    this.hostId = "";
    this.players = [];
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.isActive = true;
    this.visibility = "public";
    this.createdBySub = "";
    this.createdByEmail = "";
    this.metadata = {};
  }

  // ---------------------------------------------------------------
  // Player management
  // ---------------------------------------------------------------

  /** Add a player to the session. Returns the new PlayerState. */
  addPlayer(displayName: string, isHost = false): PlayerState {
    const player: PlayerState = {
      id: crypto.randomUUID(),
      displayName,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      isHost,
      isConnected: true,
      joinedAt: new Date().toISOString(),
      laserActive: false,
      laserOrigin: { x: 0, y: 0, z: 0 },
      laserDirection: { dx: 0, dy: 0, dz: 0 },
      chatMuted: false,
    };

    this.players.push(player);

    if (isHost) {
      this.hostId = player.id;
    }

    this._touch();
    return player;
  }

  /** Remove a player by ID. Returns true if a player was removed. */
  removePlayer(playerId: string): boolean {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return false;

    this.players.splice(idx, 1);
    this._touch();
    return true;
  }

  /** Find a player by ID, or undefined. */
  getPlayer(playerId: string): PlayerState | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  // ---------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------

  /**
   * Add a chat message attributed to a player. Returns the created message,
   * or null when the player does not exist.
   */
  addChatMessage(playerId: string, text: string): ChatMessageState | null {
    const player = this.getPlayer(playerId);
    if (!player) return null;

    const message: ChatMessageState = {
      id: crypto.randomUUID(),
      playerId,
      displayName: player.displayName,
      text,
      sentAt: new Date().toISOString(),
    };

    const messages = this.getChatMessages();
    messages.push(message);
    while (messages.length > MAX_CHAT_MESSAGES) messages.shift();
    this.metadata[CHAT_MESSAGES_KEY] = messages;

    this._touch();
    return message;
  }

  /** Return chat messages for this session, oldest first. */
  getChatMessages(): ChatMessageState[] {
    const raw = this.metadata[CHAT_MESSAGES_KEY];
    if (!Array.isArray(raw)) return [];
    return raw as ChatMessageState[];
  }

  // ---------------------------------------------------------------
  // Help requests (#294)
  // ---------------------------------------------------------------

  /** All help requests, oldest first. */
  getHelpRequests(): HelpRequestState[] {
    const raw = this.metadata[HELP_REQUESTS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw as HelpRequestState[];
  }

  /** Pending (unacknowledged) help requests for host polling. */
  getPendingHelpRequests(): HelpRequestState[] {
    return this.getHelpRequests().filter((r) => !r.acknowledgedAt);
  }

  /** Milliseconds until this player may request help again (0 = allowed). */
  helpRequestCooldownRemainingMs(playerId: string, nowMs = Date.now()): number {
    const last = this.getHelpRequests()
      .filter((r) => r.playerId === playerId)
      .map((r) => Date.parse(r.createdAt))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    if (last === undefined) return 0;
    const elapsed = nowMs - last;
    return elapsed >= HELP_REQUEST_COOLDOWN_MS
      ? 0
      : HELP_REQUEST_COOLDOWN_MS - elapsed;
  }

  /**
   * Record a help request from a joined player. Returns null when the player
   * is missing or still within the per-player cooldown window.
   */
  addHelpRequest(playerId: string, nowMs = Date.now()): HelpRequestState | null {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    if (this.helpRequestCooldownRemainingMs(playerId, nowMs) > 0) return null;

    const request: HelpRequestState = {
      id: crypto.randomUUID(),
      playerId,
      playerName: player.displayName,
      createdAt: new Date(nowMs).toISOString(),
    };

    const requests = this.getHelpRequests();
    requests.push(request);
    while (requests.length > MAX_HELP_REQUESTS) requests.shift();
    this.metadata[HELP_REQUESTS_KEY] = requests;

    this._touch();
    return request;
  }

  /** Host acknowledges a pending help request; null if id not found or already acked. */
  acknowledgeHelpRequest(requestId: string, nowMs = Date.now()): HelpRequestState | null {
    const requests = this.getHelpRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) return null;
    const existing = requests[idx]!;
    if (existing.acknowledgedAt) return null;

    const updated: HelpRequestState = {
      ...existing,
      acknowledgedAt: new Date(nowMs).toISOString(),
    };
    requests[idx] = updated;
    this.metadata[HELP_REQUESTS_KEY] = requests;
    this._touch();
    return updated;
  }

  /**
   * Add a server-generated chat message (not attributed to a player), e.g.
   * "Player joined the session". System messages are persisted alongside
   * player messages and inherit the same history cap.
   */
  addSystemMessage(text: string): ChatMessageState {
    const message: ChatMessageState = {
      id: crypto.randomUUID(),
      playerId: "",
      displayName: "",
      text,
      sentAt: new Date().toISOString(),
      system: true,
    };

    const messages = this.getChatMessages();
    messages.push(message);
    while (messages.length > MAX_CHAT_MESSAGES) messages.shift();
    this.metadata[CHAT_MESSAGES_KEY] = messages;

    this._touch();
    return message;
  }

  // ---------------------------------------------------------------
  // State mutations
  // ---------------------------------------------------------------

  /** Update a player's spatial position. */
  updatePosition(
    playerId: string,
    position: { x: number; y: number; z: number },
  ): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.position = { ...position };
    touchPlayerSeen(player);
    this._touch();
    return true;
  }

  /** Update a player's rotation. */
  updateRotation(
    playerId: string,
    rotation: { x: number; y: number; z: number },
  ): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.rotation = { ...rotation };
    touchPlayerSeen(player);
    this._touch();
    return true;
  }

  /** Set or clear the session host. */
  setHost(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // Remove host flag from the previous host.
    const prev = this.players.find((p) => p.id === this.hostId);
    if (prev) prev.isHost = false;

    player.isHost = true;
    this.hostId = playerId;
    this._touch();
    return true;
  }

  /** Mark a player as connected / disconnected. */
  setConnected(playerId: string, connected: boolean): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.isConnected = connected;
    if (!connected) {
      player.laserActive = false;
      player.lastLaserAt = undefined;
    }
    this._touch();
    return true;
  }

  // ---------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------

  /** End the session. */
  end(): void {
    this.isActive = false;
    this._touch();
  }

  /** Resume an ended session. */
  resume(): void {
    this.isActive = true;
    this._touch();
  }

  /** Produce a serialisable snapshot of the current state. */
  toJSON(): Record<string, unknown> {
    const { playlist, activeModelId } = readPlaylist(this.metadata);
    const kioskEnabled = readKioskEnabled(this.metadata);
    const { kind, startsAt, endsAt } = readSessionEvent(this.metadata);
    const { experiencePhase, rotationEndsAt } = readSessionRotation(this.metadata);
    return {
      sessionId: this.sessionId,
      label: this.label,
      hostId: this.hostId,
      players: this.players,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      visibility: this.visibility,
      createdBySub: this.createdBySub,
      createdByEmail: this.createdByEmail,
      /** Manuscript playlist model ids (#141) — also mirrored under metadata.playlist. */
      playlist,
      /** Currently loaded manuscript (#141) — also mirrored under metadata.activeModelId. */
      activeModelId,
      /** Museum public join without Bluekey (#145) — also metadata.kioskEnabled. */
      kioskEnabled,
      /** exploration | event (#146) — also metadata.kind. */
      kind,
      /** Optional event window (#146). */
      startsAt,
      endsAt,
      /** Museum host turn timer — server clamps expired turns to "ended". */
      experiencePhase,
      rotationEndsAt,
      /** Pending guest help alerts for host dashboard (#294). */
      helpRequests: this.getPendingHelpRequests(),
      metadata: { ...this.metadata },
    };
  }

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  private _touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}


export function getGameStateStats(
  gameStates: Iterable<GameState>, //collection of sessions anc multiple GameState objects
): GameStateStats { //the function must return the stats shape
  const sessions = Array.from(gameStates); //turns collection of sessions into array, making it easy to count and filter
  const activeSessions = sessions.filter((session) => session.isActive);

  //goes through every session and and adds together the number of players
  const totalPlayers = sessions.reduce(
    (total, session) => total + session.players.length,
    0,
  );

  //keeps connected players and counts them for each session
  const connectedPlayers = sessions.reduce(
    (total, session) =>
      total + session.players.filter((player) => player.isConnected).length,
    0,
  );

  //if no matching host matches at least one player, the session is orphaned
  const orphanedSessions = activeSessions.filter(
    (session) =>
      !session.players.some(
        (player) => player.id === session.hostId && player.isHost,
      ),
  ).length;

  return {
    totalSessionsCreated: sessions.length,
    activeSessions: activeSessions.length,
    totalPlayers,
    connectedPlayers,
    orphanedSessions,
    avgPlayersPerActiveSession:
    //divides players by active sessions and rounds to one decimal 
      activeSessions.length === 0
        ? 0
        : Math.round((totalPlayers / activeSessions.length) * 10) / 10,
  };
}