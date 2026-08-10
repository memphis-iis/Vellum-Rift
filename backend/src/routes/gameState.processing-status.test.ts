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

import gameStateRouter from "./gameState.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleSessionRow = {
  session_id: "session-1",
  label: "test-session",
  host_id: "",
  players: [],
  metadata: {},
  is_active: true,
  created_at: "2025-06-01T00:00:00.000Z",
  updated_at: "2025-06-01T00:00:00.000Z",
};

const sampleJobRows = [
  { job_id: "j1", model_id: "m1", status: "completed", progress: 100, error_message: null },
  { job_id: "j2", model_id: "m2", status: "processing", progress: 50, error_message: null },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Game State — Processing Status Route", () => {
  let app: express.Express;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockImplementation(async () => ({ rows: [] }));

    app = express();
    app.use(express.json());
    app.use("/api/game-state", gameStateRouter);
  });

  describe("GET /api/game-state/:sessionId/processing-status", () => {
    it("returns processing status for a valid session", async () => {
      // First query: find session by ID
      mocks.query.mockResolvedValueOnce({ rows: [sampleSessionRow] });
      // Second query: find jobs for session models
      mocks.query.mockResolvedValueOnce({ rows: sampleJobRows });

      const res = await request(app).get("/api/game-state/session-1/processing-status");

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe("session-1");
      expect(res.body.totalJobs).toBe(2);
      expect(res.body.completedJobs).toBe(1);
      expect(res.body.processingJobs).toBe(1);
      expect(res.body.isReady).toBe(false);
    });

    it("returns isReady=true for empty session", async () => {
      // First query: find session by ID
      mocks.query.mockResolvedValueOnce({ rows: [sampleSessionRow] });
      // Second query: no jobs found
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/game-state/session-1/processing-status");

      expect(res.status).toBe(200);
      expect(res.body.isReady).toBe(true);
      expect(res.body.overallProgress).toBe(100);
      expect(res.body.totalJobs).toBe(0);
    });

    it("returns 404 for non-existent session", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/game-state/nonexistent/processing-status");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
    });

    it("includes individual job summaries", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [sampleSessionRow] });
      mocks.query.mockResolvedValueOnce({ rows: sampleJobRows });

      const res = await request(app).get("/api/game-state/session-1/processing-status");

      expect(res.body.jobs).toHaveLength(2);
      expect(res.body.jobs[0].jobId).toBe("j1");
      expect(res.body.jobs[0].status).toBe("completed");
    });
  });
});
