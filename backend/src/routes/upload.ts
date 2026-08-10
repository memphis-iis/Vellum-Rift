import { Router, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { extname } from "node:path";

import { detectFileType, MAX_UPLOAD_BYTES } from "./uploadValidation.js";
import { getStorage } from "../lib/storage.js";
import { JobQueue } from "../lib/jobQueue.js";
import type { HeightMode } from "../scripts/imageArrayToOBJ.js";

const router = Router();

/** Upper bound on decoded pixels (≈16M px ≈ 4096x4096), protecting memory/CPU. */
export const MAX_UPLOAD_PIXELS = 16 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const validHeightModes: HeightMode[] = [
  "red",
  "green",
  "blue",
  "alpha",
  "brightness",
  "grayscale",
  "contrast",
];

// Will be set by index.ts after the queue is instantiated.
let jobQueue: JobQueue | null = null;

/** Register the job queue instance with this router so POST /upload can enqueue jobs. */
export function setJobQueue(q: JobQueue): void {
  jobQueue = q;
}

// ---------------------------------------------------------------------------
// POST /api/upload
//   Validate file, save raw bytes to MinIO, enqueue async processing job,
//   return 202 Accepted with jobId immediately.
// ---------------------------------------------------------------------------
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    // if no file uploaded, return 400 error
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    // validate by content (magic bytes), not by the client-supplied header
    const fileType = detectFileType(file.buffer);
    if (!fileType) {
      res.status(400).json({ error: "Unsupported file type — expected a PDF or PNG/JPEG/WebP/BMP/TIFF image" });
      return;
    }

    // if heightmode not chosen, default to brightness
    const heightMode = (req.body.heightMode ?? "brightness") as HeightMode;

    if (!validHeightModes.includes(heightMode)) {
      res.status(400).json({
        error: `heightMode must be one of: ${validHeightModes.join(", ")}`,
      });
      return;
    }

    // bump-mapping exaggeration: channel values are 0..1, so multiply them up
    const heightScale = Number(req.body.heightScale ?? 1);
    if (!Number.isFinite(heightScale) || heightScale <= 0 || heightScale > 500) {
      res.status(400).json({ error: "heightScale must be a positive number (max 500)" });
      return;
    }

    // when a pdf is uploaded, use page 1 unless the user asks for another page
    const page = Number(req.body.page ?? 1);
    if (!Number.isInteger(page) || page < 1) {
      res.status(400).json({ error: "page must be a positive integer" });
      return;
    }

    // -- Phase 1: Save raw file to MinIO ------------------------------------
    const storage = getStorage();
    const ext = extname(file.originalname) || ".bin";
    const uploadKey = `uploads/${Date.now()}-${crypto.randomUUID()}${ext}`;

    await storage.upload(
      uploadKey,
      require("node:stream").Readable.from([file.buffer]),
      file.buffer.length,
      fileType,
    );

    // -- Phase 2: Enqueue async processing job ------------------------------
    if (!jobQueue) {
      // Clean up the raw file if queue isn't available
      await storage.remove(uploadKey);
      res.status(503).json({ error: "Job queue not initialized" });
      return;
    }

    const jobId = await jobQueue.enqueueUpload({
      uploadKey,
      fileType,
      heightMode,
      heightScale,
      page,
      sessionId: req.body.sessionId ?? null,
      label: req.body.label ?? file.originalname,
    });

    // -- Respond immediately -------------------------------------------------
    res.status(202).json({
      jobId,
      status: "pending",
      message: "File uploaded. Processing started. Poll GET /api/jobs/:jobId for progress.",
    });

  } catch (err) {
    console.error("POST /api/upload failed:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ---------------------------------------------------------------------------
// Multer error handler — return JSON instead of default HTML 500
// ---------------------------------------------------------------------------
router.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
  const multerErr = err as { code?: unknown; message?: unknown } | null;
  if (multerErr && typeof multerErr.code === "string" && multerErr.code.startsWith("LIMIT_")) {
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)` });
      return;
    }
    res.status(400).json({ error: `Upload failed: ${String(multerErr.message ?? "multer error")}` });
    return;
  }
  console.error("Upload middleware error:", err);
  res.status(500).json({ error: "Failed to upload file" });
});

export default router;