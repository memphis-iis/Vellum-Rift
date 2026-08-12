import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = resolve(__dirname, "..", "migrations");

const TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * Return the list of .sql migration files in the migrations directory,
 * sorted by name (which ensures numeric-prefix ordering).
 */
function listMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Return the set of migration names that have already been applied.
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM _migrations ORDER BY name",
  );
  return new Set(rows.map((r) => r.name));
}

/**
 * Apply a single migration file within a transaction.
 */
async function applyMigration(filename: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename);
  const sql = readFileSync(filePath, "utf-8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [filename]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run all pending migrations.
 *
 * - Creates the _migrations tracking table if it doesn't exist.
 * - Reads .sql files from the migrations/ directory.
 * - Applies any that haven't been recorded yet, in filename order.
 * - Each migration runs in its own transaction.
 *
 * Returns the names of migrations that were applied during this run.
 */
export async function runMigrations(): Promise<string[]> {
  // Ensure the tracking table exists before we query it.
  await pool.query(TRACKING_TABLE_SQL);

  const files = listMigrationFiles();
  const applied = await getAppliedMigrations();

  const pending = files.filter((f) => !applied.has(f));
  const appliedNow: string[] = [];

  for (const filename of pending) {
    console.log(`[migrate] Applying ${filename} …`);
    await applyMigration(filename);
    appliedNow.push(filename);
    console.log(`[migrate] ${filename} applied successfully.`);
  }

  if (appliedNow.length === 0) {
    console.log("[migrate] No pending migrations.");
  } else {
    console.log(
      `[migrate] ${appliedNow.length} migration(s) applied: ${appliedNow.join(", ")}`,
    );
  }

  return appliedNow;
}

/**
 * CLI entry point.  Invoke via `tsx src/scripts/migrate.ts` or the
 * `pnpm migrate` workspace script.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log("[migrate] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] Fatal:", err);
      process.exit(1);
    });
}