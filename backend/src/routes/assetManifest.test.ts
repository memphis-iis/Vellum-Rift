import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

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

import assetManifestRouter from "./assetManifest.js";
import type { AssetManifest } from "../lib/assetManifest.js";

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

describe("Asset Manifest Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockImplementation(async () => ({ rows: [] }));

    app = express();
    app.use(express.json());
    app.use("/api/assets", assetManifestRouter);
  });

  describe("GET /api/assets/:assetId/manifest", () => {
    it("returns the manifest when found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const res = await request(app).get(`/api/assets/${sampleManifest.assetId}/manifest`);

      expect(res.status).toBe(200);
      expect(res.body.assetId).toBe(sampleManifest.assetId);
      expect(res.body.version).toBe("1.0.0");
      expect(res.body.totalChunks).toBe(2);
      expect(Array.isArray(res.body.chunks)).toBe(true);
      expect(res.body.chunks[0].chunkId).toBe("chunk-tl");
    });

    it("returns 404 for non-existent asset", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/assets/nonexistent/manifest");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Asset manifest not found");
    });
  });

  describe("GET /api/assets/manifests", () => {
    it("returns empty list when no manifests exist", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/assets/manifests");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it("returns list of manifests", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const res = await request(app).get("/api/assets/manifests");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("passes limit and offset to repository", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/api/assets/manifests?limit=10&offset=20");

      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("LIMIT");
      expect(sql).toContain("OFFSET");
    });
  });
});
