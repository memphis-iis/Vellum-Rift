import pool from "./db.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS game_sessions (
  session_id UUID PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  host_id     TEXT NOT NULL DEFAULT '',
  players     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * Ensure the game_sessions table exists.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 */
export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}