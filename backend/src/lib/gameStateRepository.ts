import pool from "./db.js";
import { GameState, type PlayerState } from "../components/gameState.js";

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
  state.metadata = row.metadata;
  state.isActive = row.is_active;
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
  // ---------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------

  /**
   * Create a new game session, persist it, and return the hydrated
   * GameState instance.
   */
  async create(label?: string): Promise<GameState> {
    const state = new GameState(label);
    const row = toRow(state);

    await pool.query(
      `INSERT INTO game_sessions
         (session_id, label, host_id, players, metadata, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        row.session_id,
        row.label,
        row.host_id,
        JSON.stringify(row.players),
        JSON.stringify(row.metadata),
        row.is_active,
        row.created_at,
        row.updated_at,
      ],
    );

    return state;
  }

  // ---------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------

  /**
   * Find a session by its ID.  Returns `null` when no matching row exists.
   */
  async findById(sessionId: string): Promise<GameState | null> {
    const result = await pool.query(
      `SELECT * FROM game_sessions WHERE session_id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) return null;
    return hydrate(result.rows[0]);
  }

  //find every session from the database and eventually return an array of GameState objects
  async findAll(): Promise<GameState[]> {
    //selects every row in game_sessions, oldest first
  const result = await pool.query(
    "SELECT * FROM game_sessions ORDER BY created_at ASC",
  );

  //converts each row back into a proper GameState object as database rows are plain data
  return result.rows.map((row) => hydrate(row));
}

  // ---------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------

  /**
   * Flush the full GameState to the database.
   *
   * Call this after any in-memory mutation (addPlayer, updatePosition,
   * end, etc.) so the change is persisted.
   */
  async save(state: GameState): Promise<void> {
    const row = toRow(state);

    await pool.query(
      `UPDATE game_sessions SET
         label     = $1,
         host_id   = $2,
         players   = $3::jsonb,
         metadata  = $4::jsonb,
         is_active = $5,
         updated_at = $6
       WHERE session_id = $7`,
      [
        row.label,
        row.host_id,
        JSON.stringify(row.players),
        JSON.stringify(row.metadata),
        row.is_active,
        row.updated_at,
        row.session_id,
      ],
    );
  }

  // ---------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------

  /**
   * Permanently remove a session row.  Returns `true` if a row was
   * actually deleted.
   */
  async delete(sessionId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM game_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}