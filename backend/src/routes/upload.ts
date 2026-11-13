import { Router, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";

import { detectFileType, MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS } from "./uploadValidation.js";
import { getStorage } from "../lib/storage.js";
import { JobQueue } from "../lib/jobQueue.js";
import type { HeightMode } from "../scripts/imageArrayToOBJ.js";
import type { FitMode } from "../lib/sideBySideComposite.js";

const router = Router();

export { MAX_UPLOAD_PIXELS };

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

const validFitModes: FitMode[] = ["scale", "pad"];

// Will be set by index.ts after the queue is instantiated.
let jobQueue: JobQueue | null = null;

/** Register the job queue instance with this router so POST /upload can enqueue jobs. */
export function setJobQueue(q: JobQueue): void {
  jobQueue = q;
}

function parsePage(raw: unknown, fieldName: string): number | null {
  const page = Number(raw ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    return null;
  }
  return page;
}

// ---------------------------------------------------------------------------
// POST /api/upload
//   Validate file(s), save raw bytes to MinIO, enqueue async processing job,
//   return 202 Accepted with jobId immediately.
//   Optional fileB + fitMode enables side-by-side comparison merge.
// ---------------------------------------------------------------------------
router.post(
  "/",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "fileB", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [field: string]: Express.Multer.File[] }
        | undefined;
      const file = files?.file?.[0];
      const fileB = files?.fileB?.[0];

      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }

      const fileType = detectFileType(file.buffer);
      if (!fileType) {
        res.status(400).json({
          error: "Unsupported file type — expected a PDF or PNG/JPEG/WebP/BMP/TIFF image",
        });
        return;
      }

      let fileTypeB: string | undefined;
      let fitMode: FitMode | undefined;
      if (fileB) {
        fileTypeB = detectFileType(fileB.buffer) ?? undefined;
        if (!fileTypeB) {
          res.status(400).json({
            error:
              "Unsupported fileB type — expected a PDF or PNG/JPEG/WebP/BMP/TIFF image",
          });
          return;
        }
        const rawFit = String(req.body.fitMode ?? "");
        if (!validFitModes.includes(rawFit as FitMode)) {
          res.status(400).json({ error: 'fitMode must be "scale" or "pad"' });
          return;
        }
        fitMode = rawFit as FitMode;
      }

      const heightMode = (req.body.heightMode ?? "brightness") as HeightMode;
      if (!validHeightModes.includes(heightMode)) {
        res.status(400).json({
          error: `heightMode must be one of: ${validHeightModes.join(", ")}`,
        });
        return;
      }

      let heightScale: number | undefined;
      if (req.body.heightScale !== undefined && req.body.heightScale !== "") {
        heightScale = Number(req.body.heightScale);
        if (!Number.isFinite(heightScale) || heightScale <= 0 || heightScale > 500) {
          res.status(400).json({ error: "heightScale must be a positive number (max 500)" });
          return;
        }
      }

      const page = parsePage(req.body.page, "page");
      if (page == null) {
        res.status(400).json({ error: "page must be a positive integer" });
        return;
      }

      let pageB: number | undefined;
      if (fileB) {
        const parsedB = parsePage(req.body.pageB, "pageB");
        if (parsedB == null) {
          res.status(400).json({ error: "pageB must be a positive integer" });
          return;
        }
        pageB = parsedB;
      }

      const storage = getStorage();
      const ext = extname(file.originalname) || ".bin";
      const uploadKey = `uploads/${Date.now()}-${crypto.randomUUID()}${ext}`;

      await storage.upload(
        uploadKey,
        Readable.from([file.buffer]),
        file.buffer.length,
        fileType,
      );

      let uploadKeyB: string | undefined;
      if (fileB && fileTypeB) {
        const extB = extname(fileB.originalname) || ".bin";
        uploadKeyB = `uploads/${Date.now()}-${crypto.randomUUID()}${extB}`;
        try {
          await storage.upload(
            uploadKeyB,
            Readable.from([fileB.buffer]),
            fileB.buffer.length,
            fileTypeB,
          );
        } catch (err) {
          await storage.remove(uploadKey).catch(() => undefined);
          throw err;
        }
      }

      if (!jobQueue) {
        await storage.remove(uploadKey).catch(() => undefined);
        if (uploadKeyB) await storage.remove(uploadKeyB).catch(() => undefined);
        res.status(503).json({ error: "Job queue not initialized" });
        return;
      }

      let folderId: string | null =
        typeof req.body.folderId === "string" && req.body.folderId.trim()
          ? req.body.folderId.trim()
          : null;
      const ownerSub = req.user?.sub?.trim() || null;
      if (ownerSub) {
        const { LibraryRepository } = await import("../lib/libraryRepository.js");
        const { resolveFolderAccess, canEdit } = await import("../lib/libraryAccess.js");
        const libRepo = new LibraryRepository();
        const library = await libRepo.getOrCreateLibrary(ownerSub, req.user?.email ?? "");
        if (!folderId) {
          folderId = library.uploadsFolderId;
        } else {
          const access = await resolveFolderAccess(folderId, req.user);
          if (!access.folder || !canEdit(access.level)) {
            await storage.remove(uploadKey).catch(() => undefined);
            if (uploadKeyB) await storage.remove(uploadKeyB).catch(() => undefined);
            res.status(403).json({ error: "Cannot upload into that folder" });
            return;
          }
        }
      }

      const labelDefault = fileB
        ? `${file.originalname} | ${fileB.originalname}`
        : file.originalname;

      const jobId = await jobQueue.enqueueUpload({
        uploadKey,
        fileType,
        heightMode,
        heightScale,
        page,
        sessionId: req.body.sessionId ?? null,
        label: req.body.label ?? labelDefault,
        ownerSub,
        folderId,
        ...(uploadKeyB && fileTypeB && fitMode
          ? { uploadKeyB, fileTypeB, pageB, fitMode }
          : {}),
      });

      res.status(202).json({
        jobId,
        status: "pending",
        message: "File uploaded. Processing started. Poll GET /api/jobs/:jobId for progress.",
      });
    } catch (err) {
      console.error("POST /api/upload failed:", err);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

// ---------------------------------------------------------------------------
// Multer error handler — return JSON instead of default HTML 500
// ---------------------------------------------------------------------------
router.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
  const multerErr = err as { code?: unknown; message?: unknown } | null;
  if (multerErr && typeof multerErr.code === "string" && multerErr.code.startsWith("LIMIT_")) {
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: `File too large (max ${MAX_UPLOAD_BYTES} bytes)` });
      return;
    }
    res.status(400).json({ error: `Upload failed: ${String(multerErr.message ?? "multer error")}` });
    return;
  }
  console.error("POST /api/upload unexpected error:", err);
  res.status(500).json({ error: "Failed to upload file" });
});

export default router;
