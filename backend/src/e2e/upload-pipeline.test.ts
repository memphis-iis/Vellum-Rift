import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import dotenv from "dotenv";
import { JobQueue } from "../lib/jobQueue.js";
import { initSchema } from "../lib/schema.js";
import gameStateRouter from "../routes/gameState.js";
import gltfModelRouter, { setJobQueue as setGltfJobQueue } from "../routes/gltfModel.js";
import jobsRouter, { setJobQueue as setJobsJobQueue } from "../routes/jobs.js";
import uploadRouter, { setJobQueue as setUploadJobQueue } from "../routes/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars for DB and MinIO connections (same as the real server)
dotenv.config({ path: resolve(__dirname, "../../../.env") });
dotenv.config({ path: resolve(__dirname, "../../.env") });

// ---------------------------------------------------------------------------
// Skip if SKIP_E2E is set or infra is not available
// ---------------------------------------------------------------------------

const skipE2e = process.env.SKIP_E2E === "true";

// ---------------------------------------------------------------------------
// Build a minimal Express app with all routes wired up (mirrors index.ts)
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Routes (no auth for E2E — we're testing the pipeline, not SSO)
app.use("/api/game-state", gameStateRouter);
app.use("/api/models", gltfModelRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/jobs", jobsRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll GET /api/jobs/:jobId until the job reaches a terminal state
 * (completed or failed), or the timeout is reached.
 */
async function pollJob(
  jobId: string,
  options: { interval?: number; timeout?: number } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { interval = 500, timeout = 30_000 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const res = await request(app).get(`/api/jobs/${jobId}`);

    if (res.status === 200 && (res.body.status === "completed" || res.body.status === "failed")) {
      return { status: res.status, body: res.body as Record<string, unknown> };
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Job ${jobId} did not reach a terminal state within ${timeout}ms`);
}

// ---------------------------------------------------------------------------
// Sample PDF
// ---------------------------------------------------------------------------

const SAMPLE_PDF_PATH = resolve(__dirname, "../sample/pdfs/sample-document.pdf");

let pdfBuffer: Buffer;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skipE2e)("Upload → Processing Pipeline (E2E)", () => {
  let jobQueue: JobQueue | null = null;

  beforeAll(async () => {
    // Load sample PDF
    pdfBuffer = await readFile(SAMPLE_PDF_PATH);

    // Initialize DB schema (creates tables if they don't exist)
    try {
      await initSchema();
    } catch (err) {
      throw new Error(
        `Failed to initialize database for E2E tests. Make sure docker-compose is running: ${String(err)}`,
      );
    }

    // Start the job queue with a single worker for predictable testing
    jobQueue = new JobQueue(1);
    jobQueue.start();

    // Register the queue with all routes
    setGltfJobQueue(jobQueue);
    setJobsJobQueue(jobQueue);
    setUploadJobQueue(jobQueue);
  }, 30_000);

  afterAll(async () => {
    if (jobQueue) {
      await jobQueue.stop();
    }
  }, 10_000);

  const CHANNEL_MODES = ["red", "green", "blue", "alpha", "brightness", "grayscale", "contrast"] as const;

  for (const mode of CHANNEL_MODES) {
    it(`should process sample PDF with heightMode=${mode}`, async () => {
      // 1. Upload PDF via POST /api/upload
      const uploadRes = await request(app)
        .post("/api/upload")
        .field("heightMode", mode)
        .attach("file", pdfBuffer, { filename: "sample.pdf", contentType: "application/pdf" });

      expect(uploadRes.status).toBe(202);
      expect(uploadRes.body.jobId).toBeDefined();
      expect(uploadRes.body.status).toBe("pending");

      const jobId = uploadRes.body.jobId;

      // 2. Poll GET /api/jobs/:jobId until completed or failed
      const jobRes = await pollJob(jobId, { timeout: 45_000 });
      expect(jobRes.status).toBe(200);
      expect(jobRes.body.status).toBe("completed");
      expect(jobRes.body.modelId).toBeDefined();

      const modelId = jobRes.body.modelId;

      // 3. Verify model metadata via GET /api/models/:modelId/meta
      const metaRes = await request(app).get(`/api/models/${modelId}/meta`);
      expect(metaRes.status).toBe(200);
      expect(metaRes.body.heightMode).toBe(mode);
      expect(metaRes.body.vertexCount).toBeGreaterThan(0);
      expect(metaRes.body.width).toBeGreaterThan(0);
      expect(metaRes.body.height).toBeGreaterThan(0);

      // 4. Download GLB and validate it's a valid glTF binary
      const downloadRes = await request(app).get(`/api/models/${modelId}`);
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers["content-type"]).toBe("model/gltf-binary");

      // GLB magic bytes: 0x47 0x4C 0x54 0x46 ("GLTF")
      const body = downloadRes.body as Buffer;
      expect(body.length).toBeGreaterThan(0);
      expect(body.subarray(0, 4).toString()).toBe("GLTF");
    }, 60_000);
  }

  it("should reject invalid file upload with 400", async () => {
    const res = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("not a pdf or image"), { filename: "bad.pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
  });

  it("should reject upload with no file", async () => {
    const res = await request(app).post("/api/upload");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("file is required");
  });

  it("should reject upload with invalid heightMode", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "invalid-mode")
      .attach("file", pdfBuffer, { filename: "sample.pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("heightMode must be one of");
  });
});
