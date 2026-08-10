import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock pg BEFORE importing anything that touches db.ts
// ---------------------------------------------------------------------------

vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
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

import { AssetManifestRepository } from "./assetManifestRepository.js";
import type { AssetManifest } from "./assetManifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleManifest: AssetManifest = {
  assetId: "vellum-page-001",
  version: "1.0.0",
  sourceFile: "voynich-folio-01r.pdf",
  totalChunks: 2,
  totalSizeBytes: 12288000,
  generatedAt: "2026-08-10T12:00:00.000Z",
  chunks: [
    {
      chunkId: "chunk-tl",
      region: { x: 0, y: 0, width: 512, height: 512 },
      url: "https://storage.example.com/models/vellum-page-001/chunk-tl.glb",
      sizeBytes: 6144000,
      vertexCount: 524288,
      priority: 1,
      dependencies: [],
    },
    {
      chunkId: "chunk-tr",
      region: { x: 512, y: 0, width: 512, height: 512 },
      url: "https://storage.example.com/models/vellum-page-001/chunk-tr.glb",
      sizeBytes: 6144000,
      vertexCount: 524288,
      priority: 2,
      dependencies: [],
    },
  ],
};

const sampleRow = {
  asset_id: sampleManifest.assetId,
  version: sampleManifest.version,
  source_file: sampleManifest.sourceFile,
  total_chunks: sampleManifest.totalChunks,
  total_size_bytes: sampleManifest.totalSizeBytes,
  generated_at: sampleManifest.generatedAt,
  chunks_json: JSON.stringify(sampleManifest.chunks),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AssetManifestRepository", () => {
  let repo: AssetManifestRepository;

  beforeEach(() => {
    mocks.query.mockReset();
    repo = new AssetManifestRepository();
  });

  describe("upsert", () => {
    it("inserts a manifest and returns it", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const result = await repo.upsert(sampleManifest);

      expect(result).toEqual(sampleManifest);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO asset_manifests");
    });

    it("updates existing manifest on conflict", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      await repo.upsert(sampleManifest);

      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("ON CONFLICT (asset_id) DO UPDATE");
    });
  });

  describe("findByAssetId", () => {
    it("returns the manifest when found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const result = await repo.findByAssetId(sampleManifest.assetId);
      expect(result).toEqual(sampleManifest);
    });

    it("returns null when not found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findByAssetId("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("returns all manifests ordered by most recent first", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const results = await repo.list();
      expect(results).toHaveLength(1);
      expect(results[0].assetId).toBe(sampleManifest.assetId);
    });

    it("respects limit and offset", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      await repo.list({ limit: 10, offset: 20 });

      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("LIMIT");
      expect(sql).toContain("OFFSET");
    });
  });

  describe("delete", () => {
    it("returns true when a row was deleted", async () => {
      mocks.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await repo.delete(sampleManifest.assetId);
      expect(result).toBe(true);
    });

    it("returns false when no row matched", async () => {
      mocks.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repo.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});
