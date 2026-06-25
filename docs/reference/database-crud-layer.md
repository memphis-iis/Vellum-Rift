# Database CRUD Layer

This document describes the Postgres-backed CRUD layer that replaced the original in-memory `Map` store in the backend.

## Architecture

```
 HTTP Request
      |
      v
  Route handler  (src/routes/gameState.ts)
      |
      v
  GameStateRepository  (src/lib/gameStateRepository.ts)
      |
      v
  pg.Pool             (src/lib/db.ts)
      |
      v
  Postgres            (game_sessions table)
```

The `GameState` domain class (`src/components/gameState.ts`) is kept pure -- it manages in-memory state transitions without any database awareness. The repository is responsible for persistence; route handlers call `repo.save()` after every mutation to flush changes to Postgres.

## Files

| File | Purpose |
|---|---|
| `src/lib/db.ts` | Creates and exports a `pg.Pool` configured from `DATABASE_URL`. Also exports `checkConnection()` for the health endpoint. |
| `src/lib/schema.ts` | `initSchema()` runs `CREATE TABLE IF NOT EXISTS` on startup to ensure the `game_sessions` table exists. |
| `src/lib/gameStateRepository.ts` | `GameStateRepository` class with `create`, `findById`, `save`, and `delete` methods. |

## Table Schema

```sql
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
```

- `players` is stored as a JSONB array of `PlayerState` objects.
- `metadata` is stored as a JSONB object for arbitrary feature-specific flags.
- `session_id` is a UUID generated server-side by `GameState`'s constructor.
- `created_at` and `updated_at` use `TIMESTAMPTZ` for timezone-aware timestamps.

## Repository API

```typescript
class GameStateRepository {
  create(label?: string): Promise<GameState>;
  findById(sessionId: string): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
}
```

| Method | SQL | Returns |
|---|---|---|
| `create` | `INSERT INTO game_sessions ...` | New `GameState` instance |
| `findById` | `SELECT * FROM game_sessions WHERE session_id = $1` | `GameState` or `null` |
| `save` | `UPDATE game_sessions SET ... WHERE session_id = $1` | `void` |
| `delete` | `DELETE FROM game_sessions WHERE session_id = $1` | `true` if a row was deleted |

Serialisation and deserialisation are handled by two internal helpers:

- `toRow(state)` -- converts a `GameState` into a flat row object with JSON-serialised arrays/objects for the JSONB columns.
- `hydrate(row)` -- reconstructs a `GameState` instance from a database row, using a cast to set the `readonly` properties (`sessionId`, `createdAt`).

## Route Handlers

All route handlers in `src/routes/gameState.ts` are now `async` and follow a consistent pattern:

1. Call `repo.findById(id)` to load the session.
2. Return 404 if not found.
3. Mutate the in-memory `GameState` (e.g. `state.addPlayer(...)`, `state.updatePosition(...)`).
4. Call `await repo.save(state)` to persist the change.
5. Return the JSON response.

## Server Startup

In `src/index.ts`, the server calls `initSchema()` before `app.listen()`:

```typescript
initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}/api`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database schema:", err);
    process.exit(1);
  });
```

## Configuration

The pool is configured via the `DATABASE_URL` environment variable with a fallback:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/vellum_rift
```

This is defined in `backend/.env.example` and the root `.env` file.

## Health Check

The `GET /api/health` endpoint reports database connectivity:

```json
{
  "status": "ok",
  "service": "backend",
  "environment": "development",
  "database": "connected"
}
```

If the database is unreachable, `status` becomes `"degraded"` and `database` becomes `"disconnected"`.

## Testing

- Route handler unit tests in `src/routes/gameState.test.ts` exercise `GameState` class methods directly and don't depend on the database.
- The server startup test in `src/index.test.ts` mocks `./lib/db.js` so it runs without a real Postgres connection.
- For integration testing, run `make infra-up` (or `docker compose up -d postgres`) first, then start the backend and make HTTP requests against `localhost:4000/api`.