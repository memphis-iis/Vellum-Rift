import { Router, type Request, type Response } from "express";
import { JobQueue } from "../lib/jobQueue.js";

const router = Router();

// Will be set by index.ts after the queue is instantiated.
let jobQueue: JobQueue | null = null;

/** Register the job queue instance with this router. */
export function setJobQueue(q: JobQueue): void {
  jobQueue = q;
}

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId
//   Return the current status of a processing job.
// ---------------------------------------------------------------------------
router.get("/:jobId", async (req: Request, res: Response) => {
  try {
    if (!jobQueue) {
      res.status(503).json({ error: "Job queue not initialized" });
      return;
    }

    const jobId = param(req, "jobId");
    const job = await jobQueue.getStatus(jobId);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
  } catch (err) {
    console.error(`GET /api/jobs/${req.params.jobId} failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch job status" });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs
//   List recent processing jobs with optional status filter.
// ---------------------------------------------------------------------------
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (!jobQueue) {
      res.status(503).json({ error: "Job queue not initialized" });
      return;
    }

    const status = (_req.query.status as string | undefined);
    const limit = _req.query.limit ? parseInt(String(_req.query.limit), 10) : 50;
    const offset = _req.query.offset ? parseInt(String(_req.query.offset), 10) : 0;

    const jobs = await jobQueue.listJobs({
      status: (status as any) || undefined,
      limit: isNaN(limit) ? 50 : limit,
      offset: isNaN(offset) ? 0 : offset,
    });

    res.json(jobs);
  } catch (err) {
    console.error("GET /api/jobs failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to list jobs" });
    }
  }
});

export default router;
