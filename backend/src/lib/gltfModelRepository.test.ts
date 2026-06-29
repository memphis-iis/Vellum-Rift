import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock pg BEFORE importing the repository so pool.query is controllable.
// `db.ts` does:  import pg from "pg"; const { Pool } = pg; new Pool(...)
//
// Because vi.mock factories are hoisted above ALL top-level declarations,
// we store the shared mock on globalThis so tests can retrieve it after load.
// ---------------------------------------------------------------------------

vi.mock("pg", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQuery = sharedQuery;
  return {
    ...actual,
    default: {
      Pool: class {
        query = sharedQuery;
      },
    },
  };
});

const mocks = { query: (globalThis as Record<string, unknown>).__pgMockQuery as ReturnType<typeof vi.fn> };

import { GlTFModelRepository, type GlTFModelRecord } from "./gltfModelRepository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleRow = {
  model_id: "aaaa-0000-0000-0000-000000000001",
  session_id: "bbbb-0000-0000-0000-000000000002",
  label: "test-model",
  storage_key: "models/abc123.glb",
  height_mode: "red",
  width: 4,
  height: 4,
  vertex_count: 16,
  file_size: 1024,
  created_at: "2025-06-01T00:00:00.000Z",
};

const sampleRecord: GlTFModelRecord = {
  modelId: sampleRow.model_id,
  sessionId: sampleRow.session_id,
  label: sampleRow.label,
  storageKey: sampleRow.storage_key,
  heightMode: sampleRow.height_mode,
  width: sampleRow.width,
  height: sampleRow.height,
  vertexCount: sampleRow.vertex_count,
  fileSize: sampleRow.file_size,
  createdAt: sampleRow.created_at,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GlTFModelRepository", () => {
  let repo: GlTFModelRepository;

  beforeEach(() => {
    mocks.query.mockReset();
    repo = new GlTFModelRepository();
  });

  describe("create", () => {
    it("inserts a row and returns the record", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const record = await repo.create({
        sessionId: sampleRow.session_id,
        label: sampleRow.label,
        storageKey: sampleRow.storage_key,
        heightMode: sampleRow.height_mode,
        width: sampleRow.width,
        height: sampleRow.height,
        vertexCount: sampleRow.vertex_count,
        fileSize: sampleRow.file_size,
      });

      expect(record).toEqual(sampleRecord);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO gltf_models");
    });

    it("passes null sessionId when omitted", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [{ ...sampleRow, session_id: null }] });

      await repo.create({
        label: "orphan",
        storageKey: "models/orphan.glb",
        heightMode: "blue",
        width: 2,
        height: 2,
        vertexCount: 4,
        fileSize: 512,
      });

      const params = mocks.query.mock.calls[0][1] as (string | null)[];
      expect(params[0]).toBeNull();
    });
  });

  describe("findById", () => {
    it("returns the record when found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const result = await repo.findById(sampleRow.model_id);
      expect(result).toEqual(sampleRecord);
    });

    it("returns null when not found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("findBySession", () => {
    it("returns all models for a session", async () => {
      const rows = [
        { ...sampleRow, model_id: "1111-0000-0000-0000-000000000001" },
        { ...sampleRow, model_id: "2222-0000-0000-0000-000000000002" },
      ];
      mocks.query.mockResolvedValueOnce({ rows });

      const results = await repo.findBySession(sampleRow.session_id!);
      expect(results).toHaveLength(2);
      expect(results[0].modelId).toBe("1111-0000-0000-0000-000000000001");
    });

    it("returns empty array when no models exist for session", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const results = await repo.findBySession("empty-session");
      expect(results).toEqual([]);
    });
  });

  describe("delete", () => {
    it("returns true when a row was deleted", async () => {
      mocks.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await repo.delete(sampleRow.model_id);
      expect(result).toBe(true);
    });

    it("returns false when no row matched", async () => {
      mocks.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repo.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});
