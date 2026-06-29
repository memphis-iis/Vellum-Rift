import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Mock pg BEFORE any imports that touch db.ts.
// `db.ts` does:  import pg from "pg"; const { Pool } = pg; new Pool(...)
//
// Because vi.mock factories are hoisted above ALL top-level declarations,
// we store the shared mock on globalThis so tests can retrieve it after load.
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

// ---------------------------------------------------------------------------
// Mock storage BEFORE importing routes (which call getStorage())
// ---------------------------------------------------------------------------

const mockUpload = vi.fn().mockResolvedValue({ etag: "abc123" });
const mockDownload = vi.fn();
const mockRemove = vi.fn().mockResolvedValue(undefined);
const mockPresignedUrl = vi.fn().mockResolvedValue("http://minio.local/bucket/key.glb?sig=fake");

vi.mock("../lib/storage.js", () => ({
  getStorage: () => ({
    upload: mockUpload,
    download: mockDownload,
    remove: mockRemove,
    presignedUrl: mockPresignedUrl,
  }),
  resetStorage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the glTF exporter so we don't pay the @gltf-transform cost in tests
// ---------------------------------------------------------------------------

vi.mock("../scripts/imageArrayToOBJ.js", () => ({
  TopographyMeshGenerator: class {
    generate(_pixels: unknown[], _mode: string) {
      return {
        vertices: [[0, 0, 0], [1, 0, 0.5], [0, 1, 0.5], [1, 1, 1]],
        faces: [0, 2, 1, 1, 2, 3],
        colors: [[0, 0, 0, 255], [128, 0, 0, 255], [128, 0, 0, 255], [255, 0, 0, 255]],
      };
    }
  },
  GLTFExporter: class {
    async exportToBuffer() {
      return Buffer.from("FAKEGLB");
    }
  },
}));

// ---------------------------------------------------------------------------
// Now import the router (all mocks are in place)
// ---------------------------------------------------------------------------

import gltfModelRouter from "./gltfModel.js";

// Wire the router into a full Express app (not bare Router) so error handling works
const app = express();
app.use(express.json());
app.use(gltfModelRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_MODEL_ID = "test-model-id-0000-0000-0000-000000000001";
const SAMPLE_STORAGE_KEY = "models/test-abc123.glb";

const mockDbRow = {
  model_id: SAMPLE_MODEL_ID,
  session_id: null,
  label: "test",
  storage_key: SAMPLE_STORAGE_KEY,
  height_mode: "red",
  width: 2,
  height: 2,
  vertex_count: 4,
  file_size: 7,
  created_at: "2025-06-01T00:00:00.000Z",
};

const validPixels = [
  [0, 0, [0, 0, 0, 255]],
  [1, 0, [128, 0, 0, 255]],
  [0, 1, [128, 0, 0, 255]],
  [1, 1, [255, 0, 0, 255]],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("gltfModel routes", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mockUpload.mockClear();
    mockDownload.mockClear();
    mockRemove.mockClear();
    mockPresignedUrl.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /generate
  // -----------------------------------------------------------------------

  describe("POST /generate", () => {
    it("returns 400 when pixels is missing", async () => {
      const res = await request(app)
        .post("/generate")
        .send({ heightMode: "red" })
        .expect(400);

      expect(res.body.error).toContain("pixels");
    });

    it("returns 400 when pixels is empty", async () => {
      const res = await request(app)
        .post("/generate")
        .send({ pixels: [], heightMode: "red" })
        .expect(400);

      expect(res.body.error).toContain("pixels");
    });

    it("returns 400 when heightMode is invalid", async () => {
      const res = await request(app)
        .post("/generate")
        .send({ pixels: validPixels, heightMode: "invalid" })
        .expect(400);

      expect(res.body.error).toContain("heightMode");
    });

    it("returns 201 with model record and downloadUrl on success", async () => {
      // Mock DB INSERT returning the new row
      mocks.query.mockResolvedValueOnce({ rows: [mockDbRow] });

      const res = await request(app)
        .post("/generate")
        .send({ pixels: validPixels, heightMode: "red", label: "test" })
        .expect(201);

      expect(res.body.modelId).toBe(SAMPLE_MODEL_ID);
      expect(res.body.downloadUrl).toBe("http://minio.local/bucket/key.glb?sig=fake");
      expect(res.body.heightMode).toBe("red");

      // Verify storage was called
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(mockPresignedUrl).toHaveBeenCalledWith(SAMPLE_STORAGE_KEY, 86400);
    });

    it("accepts optional sessionId", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [{ ...mockDbRow, session_id: "sess-123" }] });

      const res = await request(app)
        .post("/generate")
        .send({ pixels: validPixels, heightMode: "blue", sessionId: "sess-123" })
        .expect(201);

      expect(res.body.sessionId).toBe("sess-123");
    });
  });

  // -----------------------------------------------------------------------
  // GET /:modelId/meta
  // -----------------------------------------------------------------------

  describe("GET /:modelId/meta", () => {
    it("returns metadata for an existing model", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [mockDbRow] });

      const res = await request(app)
        .get(`/${SAMPLE_MODEL_ID}/meta`)
        .expect(200);

      expect(res.body.modelId).toBe(SAMPLE_MODEL_ID);
      expect(res.body.storageKey).toBe(SAMPLE_STORAGE_KEY);
    });

    it("returns 404 for a missing model", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/nonexistent/meta")
        .expect(404);

      expect(res.body.error).toBe("Model not found");
    });
  });

  // -----------------------------------------------------------------------
  // GET /:modelId  (serve binary)
  // -----------------------------------------------------------------------

  describe("GET /:modelId", () => {
    it("streams the glb from storage and sets correct headers", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [mockDbRow] });
      mockDownload.mockResolvedValueOnce(Readable.from(["FAKEGLB"]));

      const res = await request(app)
        .get(`/${SAMPLE_MODEL_ID}`)
        .expect(200);

      expect(res.headers["content-type"]).toBe("model/gltf-binary");
      expect(res.headers["content-disposition"]).toContain(`${SAMPLE_MODEL_ID}.glb`);
      expect(res.text).toBe("FAKEGLB");
    });

    it("returns 404 when model does not exist", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/nonexistent")
        .expect(404);

      expect(res.body.error).toBe("Model not found");
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /:modelId
  // -----------------------------------------------------------------------

  describe("DELETE /:modelId", () => {
    it("removes from storage and DB, returns 200", async () => {
      // findById
      mocks.query.mockResolvedValueOnce({ rows: [mockDbRow] });
      // delete
      mocks.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete(`/${SAMPLE_MODEL_ID}`)
        .expect(200);

      expect(res.body.removed).toBe(true);
      expect(res.body.modelId).toBe(SAMPLE_MODEL_ID);
      expect(mockRemove).toHaveBeenCalledWith(SAMPLE_STORAGE_KEY);
    });

    it("returns 404 when model does not exist", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete("/nonexistent")
        .expect(404);

      expect(res.body.error).toBe("Model not found");
    });
  });
});