import crypto from "node:crypto";

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

  /** Mark a player as connected / disconnected without removing them. */
  setConnected(playerId: string, connected: boolean): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.isConnected = connected;
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
    return {
      sessionId: this.sessionId,
      label: this.label,
      hostId: this.hostId,
      players: this.players,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
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