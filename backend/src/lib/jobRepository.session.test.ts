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

import { JobRepository } from "./jobRepository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleJobRows = [
  {
    job_id: "job-1",
    model_id: "model-1",
    status: "completed",
    progress: 100,
    error_message: null,
  },
  {
    job_id: "job-2",
    model_id: "model-2",
    status: "processing",
    progress: 50,
    error_message: null,
  },
  {
    job_id: "job-3",
    model_id: "model-3",
    status: "pending",
    progress: 0,
    error_message: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JobRepository — session processing status", () => {
  let repo: JobRepository;

  beforeEach(() => {
    mocks.query.mockReset();
    repo = new JobRepository();
  });

  describe("findBySession", () => {
    it("returns jobs for models in a session", async () => {
      mocks.query.mockResolvedValueOnce({ rows: sampleJobRows });

      const jobs = await repo.findBySession("session-1");

      expect(jobs).toHaveLength(3);
      expect(jobs[0].jobId).toBe("job-1");
      expect(jobs[0].status).toBe("completed");
    });

    it("returns empty array when no jobs exist", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const jobs = await repo.findBySession("empty-session");
      expect(jobs).toEqual([]);
    });
  });

  describe("getSessionProcessingStatus", () => {
    it("returns correct aggregate for mixed job statuses", async () => {
      mocks.query.mockResolvedValueOnce({ rows: sampleJobRows });

      const status = await repo.getSessionProcessingStatus("session-1");

      expect(status.sessionId).toBe("session-1");
      expect(status.totalJobs).toBe(3);
      expect(status.completedJobs).toBe(1);
      expect(status.failedJobs).toBe(0);
      expect(status.pendingJobs).toBe(1);
      expect(status.processingJobs).toBe(1);
      // (100 + 50 + 0) / 3 = 50
      expect(status.overallProgress).toBe(50);
      expect(status.isReady).toBe(false);
    });

    it("returns isReady=true when all jobs completed", async () => {
      const completedRows = [
        { job_id: "j1", model_id: "m1", status: "completed", progress: 100, error_message: null },
        { job_id: "j2", model_id: "m2", status: "completed", progress: 100, error_message: null },
      ];
      mocks.query.mockResolvedValueOnce({ rows: completedRows });

      const status = await repo.getSessionProcessingStatus("session-1");

      expect(status.isReady).toBe(true);
      expect(status.overallProgress).toBe(100);
      expect(status.completedJobs).toBe(2);
    });

    it("returns isReady=true for empty session (no jobs)", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const status = await repo.getSessionProcessingStatus("empty-session");

      expect(status.isReady).toBe(true);
      expect(status.overallProgress).toBe(100);
      expect(status.totalJobs).toBe(0);
    });

    it("counts failed jobs correctly", async () => {
      const failedRows = [
        { job_id: "j1", model_id: "m1", status: "completed", progress: 100, error_message: null },
        { job_id: "j2", model_id: "m2", status: "failed", progress: 30, error_message: "timeout" },
      ];
      mocks.query.mockResolvedValueOnce({ rows: failedRows });

      const status = await repo.getSessionProcessingStatus("session-1");

      expect(status.failedJobs).toBe(1);
      // No pending/processing jobs remain → isReady=true (even though one failed)
      expect(status.isReady).toBe(true);
    });

    it("includes individual job summaries", async () => {
      mocks.query.mockResolvedValueOnce({ rows: sampleJobRows });

      const status = await repo.getSessionProcessingStatus("session-1");

      expect(status.jobs).toHaveLength(3);
      expect(status.jobs[0].jobId).toBe("job-1");
      expect(status.jobs[1].errorMessage).toBeNull();
    });
  });
});
