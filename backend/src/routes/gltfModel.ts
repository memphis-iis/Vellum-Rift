import { Router, type Request, type Response } from "express";

import { isKioskGuest } from "../lib/auth.js";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { getStorage } from "../lib/storage.js";
import { GlTFModelRepository } from "../lib/gltfModelRepository.js";
import { JobQueue } from "../lib/jobQueue.js";
import { readPlaylist } from "../lib/sessionPlaylist.js";
import { readKioskEnabled } from "../lib/sessionKiosk.js";
import { LibraryRepository } from "../lib/libraryRepository.js";
import { canEdit, canView, resolveFolderAccess } from "../lib/libraryAccess.js";
import { canAccessSession } from "../lib/sessionAccess.js";

const router = Router();
const repo = new GlTFModelRepository();
const gameStateRepo = new GameStateRepository();
const libraryRepo = new LibraryRepository();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// Will be set by index.ts after the queue is instantiated.
let jobQueue: JobQueue | null = null;

/** Register the job queue instance with this router so POST /generate can enqueue jobs. */
export function setJobQueue(q: JobQueue): void {
  jobQueue = q;
}

/** Kiosk guests may only touch models on their session playlist (#145). */
async function kioskMayAccessModel(
  req: Request,
  modelId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isKioskGuest(req.user)) return { ok: true };
  const sessionId = req.user!.kioskSessionId!;
  const state = await gameStateRepo.findById(sessionId);
  if (!state || !readKioskEnabled(state.metadata) || !state.isActive) {
    return { ok: false, status: 403, error: "Kiosk join is not enabled for this space" };
  }
  const { playlist, activeModelId } = readPlaylist(state.metadata);
  const allowed = new Set(playlist);
  if (activeModelId) allowed.add(activeModelId);
  if (!allowed.has(modelId)) {
    return { ok: false, status: 403, error: "Model is not on this space playlist" };
  }
  return { ok: true };
}

/** Non-kiosk: library folder ACL when model is filed; else allow authenticated.
 * View fallback (#239): if the model is bound to a Space the caller can access,
 * allow meta/GLB so loadout / visitor preview works without a library share.
 */
async function libraryMayAccessModel(
  req: Request,
  modelId: string,
  needEdit = false,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (isKioskGuest(req.user)) return { ok: true };
  const record = await repo.findById(modelId);
  if (!record) return { ok: false, status: 404, error: "Model not found" };
  if (!record.folderId) return { ok: true };
  const access = await resolveFolderAccess(record.folderId, req.user);
  if (needEdit ? !canEdit(access.level) : !canView(access.level)) {
    if (!needEdit && record.sessionId) {
      const state = await gameStateRepo.findById(record.sessionId);
      if (state && (await canAccessSession(req.user, state))) {
        return { ok: true };
      }
    }
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// POST /api/models/generate
//   Enqueue an async glTF generation job and return 202 Accepted immediately.
// ---------------------------------------------------------------------------
router.post("/generate", async (req: Request, res: Response) => {
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot generate models" });
    return;
  }
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
    if (isKioskGuest(req.user)) {
      const sessionId = req.user!.kioskSessionId!;
      const state = await gameStateRepo.findById(sessionId);
      if (!state || !readKioskEnabled(state.metadata)) {
        res.status(403).json({ error: "Kiosk join is not enabled for this space" });
        return;
      }
      const { playlist } = readPlaylist(state.metadata);
      const models = [];
      for (const modelId of playlist) {
        const record = await repo.findById(modelId);
        if (record) models.push(record);
      }
      res.json(models);
      return;
    }

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

    const gate = await kioskMayAccessModel(req, modelId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const libGate = await libraryMayAccessModel(req, modelId);
    if (!libGate.ok) {
      res.status(libGate.status).json({ error: libGate.error });
      return;
    }

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

    const gate = await kioskMayAccessModel(req, modelId);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const libGate = await libraryMayAccessModel(req, modelId);
    if (!libGate.ok) {
      res.status(libGate.status).json({ error: libGate.error });
      return;
    }

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
// PATCH /api/models/:modelId/location — move into a library folder (#234)
// ---------------------------------------------------------------------------
router.patch("/:modelId/location", async (req: Request, res: Response) => {
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot move models" });
    return;
  }
  try {
    const modelId = param(req, "modelId");
    const folderId = String((req.body as { folderId?: string }).folderId ?? "").trim();
    if (!folderId) {
      res.status(400).json({ error: "folderId is required" });
      return;
    }

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    // Must edit current location (if filed) or be authenticated owner adopting unfiled
    if (record.folderId) {
      const fromAccess = await resolveFolderAccess(record.folderId, req.user);
      if (!canEdit(fromAccess.level)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const toAccess = await resolveFolderAccess(folderId, req.user);
    if (!toAccess.folder || !canEdit(toAccess.level)) {
      res.status(toAccess.folder ? 403 : 404).json({
        error: toAccess.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }

    const updated = await repo.setLocation(
      modelId,
      folderId,
      req.user?.sub ?? record.ownerSub,
    );
    res.json(updated);
  } catch (err) {
    console.error(`PATCH /api/models/${req.params.modelId}/location failed:`, err);
    res.status(500).json({ error: "Failed to move model" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/models/:modelId
//   Remove a model from both MinIO and the DB.
// ---------------------------------------------------------------------------
router.delete("/:modelId", async (req: Request, res: Response) => {
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot delete models" });
    return;
  }
  try {
    const modelId = param(req, "modelId");

    const libGate = await libraryMayAccessModel(req, modelId, true);
    if (!libGate.ok) {
      res.status(libGate.status).json({ error: libGate.error });
      return;
    }

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