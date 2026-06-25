import pg from "pg";

const { Pool } = pg;

/**
 * A pg.Pool connected to the local Postgres instance.
 *
 * Configured via the DATABASE_URL environment variable.
 * Falls back to a standard local-dev connection string.
 *
 * Import this pool in any route handler to run SQL queries:
 *
 *   import pool from "../lib/db.js";
 *   const { rows } = await pool.query("SELECT NOW()");
 */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/vellum_rift",
});

export default pool;

/**
 * Perform a lightweight connectivity check against the database.
 *
 * Attempts to acquire a client from the pool and immediately releases it.
 * Returns `true` if the round-trip succeeds, `false` otherwise.
 * Never throws.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}
