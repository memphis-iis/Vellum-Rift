import { Router, type Request, type Response } from "express";

import { getStorage } from "../lib/storage.js";
import { GlTFModelRepository } from "../lib/gltfModelRepository.js";
import { JobQueue } from "../lib/jobQueue.js";

const router = Router();
const repo = new GlTFModelRepository();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// Will be set by index.ts after the queue is instantiated.
let jobQueue: JobQueue | null = null;

/** Register the job queue instance with this router so POST /generate can enqueue jobs. */
export function setJobQueue(q: JobQueue): void {
  jobQueue = q;
}

// ---------------------------------------------------------------------------
// POST /api/models/generate
//   Enqueue an async glTF generation job and return 202 Accepted immediately.
// ---------------------------------------------------------------------------
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const {
      pixels,
      heightMode,
      sessionId,
      label,
    } = req.body as {
      pixels?: unknown[];
      heightMode?: string;
      sessionId?: string;
      label?: string;
    };

    // -- Validate -----------------------------------------------------------
    if (!pixels || !Array.isArray(pixels) || pixels.length === 0) {
      res.status(400).json({ error: "pixels array is required and must not be empty" });
      return;
    }

    const validModes = ["red", "green", "blue", "alpha", "brightness", "grayscale", "contrast"];
    if (!heightMode || !validModes.includes(heightMode)) {
      res.status(400).json({ error: `heightMode must be one of: ${validModes.join(", ")}` });
      return;
    }

    // -- Enqueue job (non-blocking) -----------------------------------------
    if (!jobQueue) {
      res.status(503).json({ error: "Job queue not initialized" });
      return;
    }

    const jobId = await jobQueue.enqueueGenerate({
      pixels: pixels as any,
      heightMode: heightMode as any,
      sessionId: sessionId ?? null,
      label: label ?? "",
    });

    // -- Respond immediately ------------------------------------------------
    res.status(202).json({
      jobId,
      status: "pending",
      message: "Job enqueued. Poll GET /api/jobs/:jobId for progress.",
    });
  } catch (err) {
    console.error("POST /api/models/generate failed:", err);
    res.status(500).json({ error: "Failed to enqueue glTF generation job" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/models
//   List processed manuscript meshes (newest first).
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const models = await repo.list({
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    });

    res.json(models);
  } catch (err) {
    console.error("GET /api/models failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to list models" });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/models/:modelId
//   Serve a previously-generated .glb file directly to the Unity client.
// ---------------------------------------------------------------------------
router.get("/:modelId", async (req: Request, res: Response) => {
  try {
    const modelId = param(req, "modelId");

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    // Stream the .glb from MinIO directly to the HTTP response.
    const storage = getStorage();
    const downloadStream = await storage.download(record.storageKey);

    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Content-Disposition", `attachment; filename="${modelId}.glb"`);

    // Pipe MinIO stream → Express response
    (downloadStream as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    console.error(`GET /api/models/${req.params.modelId} failed:`, err);
    // Only send error if headers haven't been sent (stream may have already started piping)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to serve glTF model" });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/models/:modelId/meta
//   Return just the metadata record for a model (no binary payload).
// ---------------------------------------------------------------------------
router.get("/:modelId/meta", async (req: Request, res: Response) => {
  try {
    const modelId = param(req, "modelId");

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    res.json(record);
  } catch (err) {
    console.error(`GET /api/models/${req.params.modelId}/meta failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch model metadata" });
    }
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/models/:modelId
//   Remove a model from both MinIO and the DB.
// ---------------------------------------------------------------------------
router.delete("/:modelId", async (req: Request, res: Response) => {
  try {
    const modelId = param(req, "modelId");

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    // Delete from MinIO first, then DB.
    const storage = getStorage();
    await storage.remove(record.storageKey);
    await repo.delete(modelId);

    res.json({ removed: true, modelId });
  } catch (err) {
    console.error(`DELETE /api/models/${req.params.modelId} failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  }
});

export default router;