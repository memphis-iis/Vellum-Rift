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

import { JobRepository, type ProcessingJobRecord } from "./jobRepository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleRow = {
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

const sampleRecord: ProcessingJobRecord = {
  jobId: sampleRow.job_id,
  modelId: sampleRow.model_id,
  uploadKey: sampleRow.upload_key,
  payload: sampleRow.payload,
  status: sampleRow.status as ProcessingJobRecord["status"],
  progress: sampleRow.progress,
  errorMessage: sampleRow.error_message,
  createdAt: sampleRow.created_at,
  updatedAt: sampleRow.updated_at,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobRepository", () => {
  let repo: JobRepository;

  beforeEach(() => {
    mocks.query.mockReset();
    repo = new JobRepository();
  });

  describe("create", () => {
    it("inserts a row and returns the record", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const record = await repo.create({ jobId: sampleRow.job_id });

      expect(record).toEqual(sampleRecord);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      const sql = mocks.query.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO processing_jobs");
    });

    it("generates a UUID when jobId is not provided", async () => {
      const uuidRow = { ...sampleRow, job_id: "auto-uuid-0000-0000-0000-000000000002" };
      mocks.query.mockResolvedValueOnce({ rows: [uuidRow] });

      const record = await repo.create({});

      // The first param should be a UUID (auto-generated)
      const params = mocks.query.mock.calls[0][1] as (string | null)[];
      expect(params[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("passes custom jobId when provided", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      await repo.create({ jobId: "custom-id" });

      const params = mocks.query.mock.calls[0][1] as (string | null)[];
      expect(params[0]).toBe("custom-id");
    });
  });

  describe("findById", () => {
    it("returns the record when found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleRow] });

      const result = await repo.findById(sampleRow.job_id);
      expect(result).toEqual(sampleRecord);
    });

    it("returns null when not found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("updates status and progress", async () => {
      const updatedRow = { ...sampleRow, status: "processing", progress: 50 };
      mocks.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await repo.update(sampleRow.job_id, {
        status: "processing",
        progress: 50,
      });

      expect(result!.status).toBe("processing");
      expect(result!.progress).toBe(50);
    });

    it("updates error message on failure", async () => {
      const failedRow = {
        ...sampleRow,
        status: "failed",
        error_message: "Something went wrong",
      };
      mocks.query.mockResolvedValueOnce({ rows: [failedRow] });

      const result = await repo.update(sampleRow.job_id, {
        status: "failed",
        errorMessage: "Something went wrong",
      });

      expect(result!.status).toBe("failed");
      expect(result!.errorMessage).toBe("Something went wrong");
    });

    it("updates model_id on completion", async () => {
      const completedRow = {
        ...sampleRow,
        status: "completed",
        progress: 100,
        model_id: "model-uuid-here",
      };
      mocks.query.mockResolvedValueOnce({ rows: [completedRow] });

      const result = await repo.update(sampleRow.job_id, {
        status: "completed",
        progress: 100,
        modelId: "model-uuid-here",
      });

      expect(result!.status).toBe("completed");
      expect(result!.progress).toBe(100);
      expect(result!.modelId).toBe("model-uuid-here");
    });

    it("returns null when job not found", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const result = await repo.update("nonexistent", { status: "processing" });
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("returns all jobs ordered by most recent first", async () => {
      const rows = [
        { ...sampleRow, job_id: "job-2" },
        { ...sampleRow, job_id: "job-1" },
      ];
      mocks.query.mockResolvedValueOnce({ rows });

      const results = await repo.list();
      expect(results).toHaveLength(2);
      expect(results[0].jobId).toBe("job-2");
    });

    it("filters by status", async () => {
      const rows = [{ ...sampleRow, job_id: "pending-job", status: "pending" }];
      mocks.query.mockResolvedValueOnce({ rows });

      const results = await repo.list({ status: "pending" });
      expect(results.every((j) => j.status === "pending")).toBe(true);
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

      const result = await repo.delete(sampleRow.job_id);
      expect(result).toBe(true);
    });

    it("returns false when no row matched", async () => {
      mocks.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repo.delete("nonexistent");
      expect(result).toBe(false);
    });
  });
});