import { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";

import { isKioskGuest } from "../lib/auth.js";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { getStorage } from "../lib/storage.js";
import { GlTFModelRepository, type GlTFModelRecord } from "../lib/gltfModelRepository.js";
import { JobQueue } from "../lib/jobQueue.js";
import { readPlaylist } from "../lib/sessionPlaylist.js";
import { readKioskEnabled } from "../lib/sessionKiosk.js";
import { getLoDBudget, LOD_TIER_KEYS, type LoDTier } from "../lib/lodTiers.js";
import { lodStorageKey, subsampleGlb } from "../lib/lodGlb.js";

const router = Router();
const repo = new GlTFModelRepository();
const gameStateRepo = new GameStateRepository();

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

/**
 * Quest (and any other client) asks with `?tier=quest`. When the stored grid
 * is over that tier's vertex budget, serve a cached subsampled GLB. No tier,
 * or a mesh already inside the budget, keeps the original key.
 * Returns null when the tier name is not one we know.
 */
async function resolveTierStorageKey(
  record: GlTFModelRecord,
  tierQuery: unknown,
): Promise<string | null> {
  if (tierQuery == null || tierQuery === "") return record.storageKey;
  if (typeof tierQuery !== "string") return null;

  let tier: LoDTier;
  try {
    tier = getLoDBudget(tierQuery).tier;
  } catch {
    return null;
  }

  const budget = getLoDBudget(tier);
  if (!Number.isFinite(budget.maxVertices) || record.vertexCount <= budget.maxVertices) {
    return record.storageKey;
  }

  const storage = getStorage();
  const cacheKey = lodStorageKey(record.storageKey, tier);
  try {
    await storage.stat(cacheKey);
    return cacheKey;
  } catch {
    // Cache miss — build it once.
  }

  const original = await storage.downloadBuffer(record.storageKey);
  const reduced = await subsampleGlb(original, {
    maxVertices: budget.maxVertices,
    maxTextureSize: budget.maxTextureSize,
    width: record.width,
    height: record.height,
  });
  if (!reduced.changed) {
    console.warn(
      `[models] ${record.modelId} is ${record.vertexCount} verts but could not be subsampled for ${tier}; serving original`,
    );
    return record.storageKey;
  }

  await storage.upload(
    cacheKey,
    Readable.from(reduced.glb),
    reduced.glb.length,
    "model/gltf-binary",
  );
  console.log(
    `[models] Cached ${tier} LoD for ${record.modelId}: ${record.vertexCount} → ${reduced.vertexCount} verts`,
  );
  return cacheKey;
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

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    const storage = getStorage();
    const storageKey = await resolveTierStorageKey(record, req.query.tier);
    if (storageKey == null) {
      res.status(400).json({
        error: `Invalid LoD tier. Must be one of: ${LOD_TIER_KEYS.join(", ")}`,
      });
      return;
    }

    const downloadStream = await storage.download(storageKey);

    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Content-Disposition", `attachment; filename="${modelId}.glb"`);

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
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot delete models" });
    return;
  }
  try {
    const modelId = param(req, "modelId");

    const record = await repo.findById(modelId);
    if (!record) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    // Delete from MinIO first, then DB. Cached tier variants sit beside the original.
    const storage = getStorage();
    await storage.remove(record.storageKey);
    for (const tier of LOD_TIER_KEYS) {
      if (tier === "archival") continue;
      try {
        await storage.remove(lodStorageKey(record.storageKey, tier));
      } catch (err) {
        console.warn(`DELETE cache ${tier} for ${modelId} failed:`, err);
      }
    }
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