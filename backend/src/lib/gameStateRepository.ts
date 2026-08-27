import pool from "./db.js";
import { GameState, type PlayerState, type SessionVisibility } from "../components/gameState.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw shape of a row in the game_sessions table. */
interface GameSessionRow {
  session_id: string;
  label: string;
  host_id: string;
  players: PlayerState[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  visibility: string;
  created_by_sub: string;
  created_by_email: string;
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Row <-> GameState mapping
// ---------------------------------------------------------------------------

/** Serialise a GameState into columns for INSERT/UPDATE. */
function toRow(state: GameState): GameSessionRow {
  return {
    session_id: state.sessionId,
    label: state.label,
    host_id: state.hostId,
    players: state.players,
    metadata: state.metadata,
    is_active: state.isActive,
    visibility: state.visibility,
    created_by_sub: state.createdBySub,
    created_by_email: state.createdByEmail,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  };
}

/** Rehydrate a GameState instance from a database row. */
function hydrate(row: GameSessionRow): GameState {
  const state = new GameState();
  // `sessionId` and `createdAt` are declared `readonly` on GameState, so we
  // use a cast to set them during deserialisation.
  (state as Record<"sessionId" | "createdAt", string>).sessionId = row.session_id;
  (state as Record<"sessionId" | "createdAt", string>).createdAt = row.created_at;
  state.label = row.label;
  state.hostId = row.host_id;
  state.players = row.players;
  state.metadata = row.metadata ?? {};
  state.isActive = row.is_active;
  state.visibility = (row.visibility === "private" ? "private" : "public") as SessionVisibility;
  state.createdBySub = row.created_by_sub ?? "";
  state.createdByEmail = row.created_by_email ?? "";
  state.updatedAt = row.updated_at;
  return state;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * CRUD repository for GameState backed by Postgres (game_sessions table).
 *
 * Every mutation is flushed to the database immediately.  Route handlers
 * call `save()` after each in-memory mutation to keep the DB in sync.
 */
export class GameStateRepository {
  /**
   * Create a new game session, persist it, and return the hydrated
   * GameState instance.
   */
  async create(
    label?: string,
    options?: {
      visibility?: SessionVisibility;
      createdBySub?: string;
      createdByEmail?: string;
    },
  ): Promise<GameState> {
    const state = new GameState(label);
    if (options?.visibility) state.visibility = options.visibility;
    if (options?.createdBySub) state.createdBySub = options.createdBySub;
    if (options?.createdByEmail) state.createdByEmail = options.createdByEmail;
    const row = toRow(state);

    await pool.query(
      `INSERT INTO game_sessions
         (session_id, label, host_id, players, metadata, is_active,
          visibility, created_by_sub, created_by_email, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
      [
        row.session_id,
        row.label,
        row.host_id,
        JSON.stringify(row.players),
        JSON.stringify(row.metadata),
        row.is_active,
        row.visibility,
        row.created_by_sub,
        row.created_by_email,
        row.created_at,
        row.updated_at,
      ],
    );

    return state;
  }

  async findById(sessionId: string): Promise<GameState | null> {
    const result = await pool.query(
      `SELECT * FROM game_sessions WHERE session_id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) return null;
    return hydrate(result.rows[0] as GameSessionRow);
  }

  async findAll(): Promise<GameState[]> {
    const result = await pool.query(
      "SELECT * FROM game_sessions ORDER BY updated_at DESC",
    );
    return (result.rows as GameSessionRow[]).map((row) => hydrate(row));
  }

  async save(state: GameState): Promise<void> {
    const row = toRow(state);

    await pool.query(
      `UPDATE game_sessions SET
         label     = $1,
         host_id   = $2,
         players   = $3::jsonb,
         metadata  = $4::jsonb,
         is_active = $5,
         visibility = $6,
         created_by_sub = $7,
         created_by_email = $8,
         updated_at = $9
       WHERE session_id = $10`,
      [
        row.label,
        row.host_id,
        JSON.stringify(row.players),
        JSON.stringify(row.metadata),
        row.is_active,
        row.visibility,
        row.created_by_sub,
        row.created_by_email,
        row.updated_at,
        row.session_id,
      ],
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM game_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
