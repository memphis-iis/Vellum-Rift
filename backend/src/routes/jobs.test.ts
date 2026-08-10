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

// ---------------------------------------------------------------------------
// Mock storage and glTF exporter (not used by jobs routes directly, but
// JobQueue imports them at module load time)
// ---------------------------------------------------------------------------

vi.mock("../lib/storage", () => ({
  getStorage: vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ bucket: "test", key: "test.glb" }),
  })),
}));

vi.mock("../scripts/imageArrayToOBJ.js", () => ({
  TopographyMeshGenerator: class {
    generate() {
      return { vertices: [], faces: [], colors: [] };
    }
  },
  GLTFExporter: class {
    async exportToBuffer() {
      return Buffer.from("FAKEGLB");
    }
  },
}));

// ---------------------------------------------------------------------------
// Now import the router
// ---------------------------------------------------------------------------

import jobsRouter, { setJobQueue } from "./jobs.js";
import { JobQueue } from "../lib/jobQueue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleJobRow = {
  job_id: "test-job-0000-0000-0000-000000000001",
  model_id: null,
  status: "completed",
  progress: 100,
  error_message: null,
  created_at: "2025-06-01T00:00:00.000Z",
  updated_at: "2025-06-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Jobs Routes", () => {
  let app: express.Express;
  let queue: JobQueue;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockImplementation(async () => ({ rows: [] }));

    app = express();
    app.use(express.json());
    app.use("/api/jobs", jobsRouter);

    queue = new JobQueue(1);
    setJobQueue(queue);
  });

  it("GET /api/jobs/:jobId returns 404 for non-existent job", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/jobs/non-existent-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Job not found");
  });

  it("GET /api/jobs/:jobId returns job status when found", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const res = await request(app).get(`/api/jobs/${sampleJobRow.job_id}`);

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(sampleJobRow.job_id);
    expect(res.body.status).toBe("completed");
    expect(res.body.progress).toBe(100);
  });

  it("GET /api/jobs returns empty list when no jobs exist", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it("GET /api/jobs lists jobs", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/jobs?status=completed filters by status", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const res = await request(app).get("/api/jobs?status=completed");

    expect(res.status).toBe(200);
    expect(res.body.every((j: any) => j.status === "completed")).toBe(true);
  });

  it("GET /api/jobs passes limit and offset", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await request(app).get("/api/jobs?limit=10&offset=20");

    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });
});