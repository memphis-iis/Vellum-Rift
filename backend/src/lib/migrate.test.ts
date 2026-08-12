import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the pure-logic helpers (listMigrationFiles, getAppliedMigrations,
// applyMigration, runMigrations) by mocking the db pool and fs calls.

const mockQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock("./db.js", () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => Promise.resolve({ query: mockQuery, release: mockRelease }),
  },
}));

// Mock fs functions at the module level so migrate.ts picks them up.
vi.mock("node:fs", () => {
  // We only need to mock the three functions migrate.ts uses.
  let existsSyncImpl = (_p: unknown) => true;
  let readdirSyncImpl = (_p: unknown) => [] as string[];
  let readFileSyncImpl = (_p: unknown, _enc?: unknown) => "";

  return {
    existsSync: (p: unknown) => existsSyncImpl(p),
    readdirSync: (p: unknown) => readdirSyncImpl(p),
    readFileSync: (p: unknown, enc?: unknown) => readFileSyncImpl(p, enc),
    // Allow tests to override implementations
    __setExistsSync: (fn: (p: unknown) => boolean) => {
      existsSyncImpl = fn;
    },
    __setReaddirSync: (fn: (p: unknown) => string[]) => {
      readdirSyncImpl = fn;
    },
    __setReadFileSync: (fn: (p: unknown, enc?: unknown) => string) => {
      readFileSyncImpl = fn;
    },
  };
});

// Re-import after mocks are set up so the module uses our mocked deps.
const { runMigrations } = await import("./migrate.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fsMock = (await vi.importMock("node:fs")) as any;

function setExistsSync(fn: (p: unknown) => boolean) {
  fsMock.__setExistsSync(fn);
}
function setReaddirSync(fn: (p: unknown) => string[]) {
  fsMock.__setReaddirSync(fn);
}
function setReadFileSync(fn: (p: unknown, enc?: unknown) => string) {
  fsMock.__setReadFileSync(fn);
}

describe("runMigrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fs mocks to defaults
    setExistsSync(() => true);
    setReaddirSync(() => []);
    setReadFileSync(() => "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the _migrations tracking table on first run", async () => {
    setReaddirSync(() => []);
    // No rows returned = no applied migrations
    mockQuery.mockResolvedValueOnce({ rows: [] }); // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT from _migrations

    const applied = await runMigrations();

    expect(applied).toEqual([]);
    // First query should be the CREATE TABLE IF NOT EXISTS
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const firstCallSql = mockQuery.mock.calls[0][0] as string;
    expect(firstCallSql).toContain("CREATE TABLE IF NOT EXISTS _migrations");
  });

  it("applies pending migrations in filename order", async () => {
    setReaddirSync(() => [
      "002_add_foo.sql",
      "001_initial_schema.sql",
      "003_add_bar.sql",
    ]);
    setReadFileSync((p: unknown) => {
      const path = String(p);
      if (path.includes("001")) return "CREATE TABLE foo (id INT);";
      if (path.includes("002")) return "ALTER TABLE foo ADD COLUMN bar TEXT;";
      if (path.includes("003")) return "CREATE INDEX idx_foo ON foo(id);";
      return "";
    });

    // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT applied — none yet
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // For each of the 3 pending migrations: BEGIN, SQL, INSERT, COMMIT
    // 001
    mockQuery.mockResolvedValueOnce(undefined); // BEGIN
    mockQuery.mockResolvedValueOnce(undefined); // SQL
    mockQuery.mockResolvedValueOnce(undefined); // INSERT
    mockQuery.mockResolvedValueOnce(undefined); // COMMIT
    // 002
    mockQuery.mockResolvedValueOnce(undefined); // BEGIN
    mockQuery.mockResolvedValueOnce(undefined); // SQL
    mockQuery.mockResolvedValueOnce(undefined); // INSERT
    mockQuery.mockResolvedValueOnce(undefined); // COMMIT
    // 003
    mockQuery.mockResolvedValueOnce(undefined); // BEGIN
    mockQuery.mockResolvedValueOnce(undefined); // SQL
    mockQuery.mockResolvedValueOnce(undefined); // INSERT
    mockQuery.mockResolvedValueOnce(undefined); // COMMIT

    const applied = await runMigrations();

    // Should be sorted: 001, 002, 003
    expect(applied).toEqual([
      "001_initial_schema.sql",
      "002_add_foo.sql",
      "003_add_bar.sql",
    ]);
  });

  it("skips already-applied migrations", async () => {
    setReaddirSync(() => [
      "001_initial_schema.sql",
      "002_add_foo.sql",
    ]);
    setReadFileSync(() => "SELECT 1;");

    // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT applied — 001 already applied
    mockQuery.mockResolvedValueOnce({
      rows: [{ name: "001_initial_schema.sql" }],
    });

    // Only 002 should be applied
    mockQuery.mockResolvedValueOnce(undefined); // BEGIN
    mockQuery.mockResolvedValueOnce(undefined); // SQL
    mockQuery.mockResolvedValueOnce(undefined); // INSERT
    mockQuery.mockResolvedValueOnce(undefined); // COMMIT

    const applied = await runMigrations();

    expect(applied).toEqual(["002_add_foo.sql"]);
  });

  it("returns empty array when all migrations are already applied", async () => {
    setReaddirSync(() => ["001_initial_schema.sql"]);
    setReadFileSync(() => "SELECT 1;");

    // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT applied — all applied
    mockQuery.mockResolvedValueOnce({
      rows: [{ name: "001_initial_schema.sql" }],
    });

    const applied = await runMigrations();

    expect(applied).toEqual([]);
    // Only 2 calls: CREATE + SELECT
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when migrations directory does not exist", async () => {
    setExistsSync(() => false);

    // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT applied
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const applied = await runMigrations();

    expect(applied).toEqual([]);
  });

  it("rolls back transaction on SQL error and re-throws", async () => {
    setReaddirSync(() => ["001_initial_schema.sql"]);
    setReadFileSync(() => "BAD SQL;");

    // _migrations CREATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // SELECT applied — none
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // BEGIN succeeds, SQL fails
    mockQuery.mockResolvedValueOnce(undefined); // BEGIN
    const sqlError = new Error("syntax error");
    mockQuery.mockRejectedValueOnce(sqlError); // SQL fails
    mockQuery.mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(runMigrations()).rejects.toThrow("syntax error");

    // Verify ROLLBACK was called
    const rollbackCall = mockQuery.mock.calls.find(
      (call: unknown[]) => call[0] === "ROLLBACK",
    );
    expect(rollbackCall).toBeDefined();
  });
});