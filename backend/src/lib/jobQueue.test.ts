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

// ---------------------------------------------------------------------------
// Mock storage BEFORE importing jobQueue (which calls getStorage())
// ---------------------------------------------------------------------------

vi.mock("../lib/storage", () => ({
  getStorage: vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ bucket: "test", key: "test.glb" }),
    downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-raw-file")),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Mock the glTF exporter and image converter
// ---------------------------------------------------------------------------

vi.mock("../scripts/imageArrayToOBJ.js", () => ({
  TopographyMeshGenerator: class {
    generate(_pixels: unknown[], _mode: string, _scale?: number) {
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

vi.mock("../scripts/imageTo3DArray.js", () => ({
  ImageTo3DArray: class {
    async pdf2ArrayFromBuffer(_buf: Buffer, _page: number) {
      return [[0, 0, [255, 255, 255, 255]], [1, 0, [0, 0, 0, 255]]];
    }
    async img2ArrayFromBuffer(_buf: Buffer) {
      return [[0, 0, [255, 255, 255, 255]], [1, 0, [0, 0, 0, 255]]];
    }
  },
}));

// ---------------------------------------------------------------------------
// Now import the module under test
// ---------------------------------------------------------------------------

import { JobQueue } from "../lib/jobQueue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleJobRow = {
  job_id: "test-job-0000-0000-0000-000000000001",
  model_id: null,
  upload_key: null,
  payload: null,
  status: "pending",
  progress: 0,
  error_message: null,
  created_at: "2025-06-01T00:00:00.000Z",
  updated_at: "2025-06-01T00:00:00.000Z",
};

const sampleModelRow = {
  model_id: "test-model-0000-0000-0000-000000000002",
  session_id: null,
  label: "test",
  storage_key: "models/test.glb",
  height_mode: "brightness",
  width: 2,
  height: 1,
  vertex_count: 4,
  file_size: 7,
  created_at: "2025-06-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    mocks.query.mockReset();
    // Default: all queries succeed with empty rows (safe fallback)
    mocks.query.mockImplementation(async () => ({ rows: [] }));
    queue = new JobQueue(1); // single worker for predictable testing
  });

  it("should enqueue a generate job and return a job ID immediately", async () => {
    // Mock the INSERT ... RETURNING query
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const jobId = await queue.enqueueGenerate({
      pixels: [[0, 0, [255, 255, 255, 255]]],
      heightMode: "brightness",
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
  });

  it("should enqueue an upload job and return a job ID immediately", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const jobId = await queue.enqueueUpload({
      uploadKey: "uploads/test.png",
      fileType: "image/png",
      heightMode: "brightness",
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");
  });

  it("should persist the generate job as pending in the DB after enqueue", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    await queue.enqueueGenerate({
      pixels: [[0, 0, [255, 255, 255, 255]]],
      heightMode: "brightness",
    });

    // Verify the INSERT was called with status=pending
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO processing_jobs");
    const params = mocks.query.mock.calls[0][1] as (string | null | number)[];
    expect(params[4]).toBe("pending"); // status param
  });

  it("should persist the upload job with uploadKey and payload", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    await queue.enqueueUpload({
      uploadKey: "uploads/test.png",
      fileType: "image/png",
      heightMode: "brightness",
    });

    const params = mocks.query.mock.calls[0][1] as (string | null | number | object)[];
    expect(params[2]).toBe("uploads/test.png"); // uploadKey param
    expect(params[3]).toHaveProperty("type", "upload"); // payload object
  });

  it("should process a generate job to completion", async () => {
    queue.start();

    // Persistent mock: handles all queries the worker + getStatus will fire
    let currentJob = {
      job_id: sampleJobRow.job_id,
      model_id: null as string | null,
      upload_key: null as string | null,
      payload: null as unknown,
      status: "pending" as string,
      progress: 0,
      error_message: null as string | null,
      created_at: sampleJobRow.created_at,
      updated_at: sampleJobRow.updated_at,
    };
    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const s = sql as string;

      if (s.includes("INSERT INTO processing_jobs")) {
        return { rows: [currentJob] };
      }
      if (s.includes("UPDATE processing_jobs")) {
        currentJob.status = "completed";
        currentJob.progress = 100;
        currentJob.model_id = sampleModelRow.model_id;
        return { rows: [currentJob] };
      }
      if (s.includes("INSERT INTO gltf_models")) {
        return { rows: [sampleModelRow] };
      }
      if (s.includes("SELECT * FROM processing_jobs")) {
        return { rows: [currentJob] };
      }
      return { rows: [] };
    });

    const jobId = await queue.enqueueGenerate({
      pixels: [[0, 0, [255, 255, 255, 255]], [1, 0, [0, 0, 0, 255]]],
      heightMode: "brightness",
      label: "test-model",
    });

    currentJob.job_id = jobId;

    // Wait for the worker to finish (mocks are fast)
    await new Promise((r) => setTimeout(r, 500));

    const status = await queue.getStatus(jobId);
    expect(status).not.toBeNull();
    expect(status!.status).toBe("completed");
    expect(status!.progress).toBe(100);
  });

  it("should process an upload job to completion", async () => {
    queue.start();

    let currentJob = {
      job_id: sampleJobRow.job_id,
      model_id: null as string | null,
      upload_key: "uploads/test.png" as string | null,
      payload: { type: "upload" } as unknown,
      status: "pending" as string,
      progress: 0,
      error_message: null as string | null,
      created_at: sampleJobRow.created_at,
      updated_at: sampleJobRow.updated_at,
    };
    mocks.query.mockImplementation(async (sql: string) => {
      const s = sql as string;

      if (s.includes("INSERT INTO processing_jobs")) {
        return { rows: [currentJob] };
      }
      if (s.includes("UPDATE processing_jobs")) {
        currentJob.status = "completed";
        currentJob.progress = 100;
        currentJob.model_id = sampleModelRow.model_id;
        return { rows: [currentJob] };
      }
      if (s.includes("INSERT INTO gltf_models")) {
        return { rows: [sampleModelRow] };
      }
      if (s.includes("SELECT * FROM processing_jobs")) {
        return { rows: [currentJob] };
      }
      return { rows: [] };
    });

    const jobId = await queue.enqueueUpload({
      uploadKey: "uploads/test.png",
      fileType: "image/png",
      heightMode: "brightness",
    });

    currentJob.job_id = jobId;

    // Wait for the worker to finish
    await new Promise((r) => setTimeout(r, 500));

    const status = await queue.getStatus(jobId);
    expect(status).not.toBeNull();
    expect(status!.status).toBe("completed");
    expect(status!.progress).toBe(100);
  });

  it("should handle job failure gracefully", async () => {
    queue.start();

    let currentJob = {
      job_id: sampleJobRow.job_id,
      model_id: null as string | null,
      upload_key: null as string | null,
      payload: null as unknown,
      status: "pending" as string,
      progress: 0,
      error_message: null as string | null,
      created_at: sampleJobRow.created_at,
      updated_at: sampleJobRow.updated_at,
    };
    mocks.query.mockImplementation(async (sql: string) => {
      const s = sql as string;

      if (s.includes("INSERT INTO processing_jobs")) {
        return { rows: [currentJob] };
      }
      if (s.includes("UPDATE processing_jobs")) {
        currentJob.status = "failed";
        currentJob.error_message = "Simulated failure";
        return { rows: [currentJob] };
      }
      if (s.includes("SELECT * FROM processing_jobs")) {
        return { rows: [currentJob] };
      }
      return { rows: [] };
    });

    const jobId = await queue.enqueueGenerate({
      pixels: [[0, 0, [255, 255, 255, 255]]],
      heightMode: "brightness",
    });

    currentJob.job_id = jobId;

    // Wait for the worker to process and fail
    await new Promise((r) => setTimeout(r, 500));

    const status = await queue.getStatus(jobId);
    expect(status).not.toBeNull();
    expect(status!.status).toBe("failed");
    expect(status!.errorMessage).toContain("Simulated failure");
  });

  it("should return null for non-existent job", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const status = await queue.getStatus("non-existent-id");
    expect(status).toBeNull();
  });

  it("should list jobs", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [sampleJobRow] });

    const jobs = await queue.listJobs();
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it("should filter listed jobs by status", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ ...sampleJobRow, status: "failed" }],
    });

    const failedJobs = await queue.listJobs({ status: "failed" });
    expect(failedJobs.length).toBeGreaterThanOrEqual(1);
    expect(failedJobs[0].status).toBe("failed");
  });
});
