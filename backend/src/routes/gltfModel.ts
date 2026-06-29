import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";

import { TopographyMeshGenerator, GLTFExporter, type PixelDataTuple, type HeightMode } from "../scripts/imageArrayToOBJ.js";
import { getStorage } from "../lib/storage.js";
import { GlTFModelRepository } from "../lib/gltfModelRepository.js";

const router = Router();
const repo = new GlTFModelRepository();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// ---------------------------------------------------------------------------
// POST /api/models/generate
//   Generate a glTF Binary (.glb) from pixel data, store it in MinIO,
//   persist metadata to the DB, and return the model record.
// ---------------------------------------------------------------------------
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const {
      pixels,
      heightMode,
      sessionId,
      label,
    } = req.body as {
      pixels?: PixelDataTuple[];
      heightMode?: string;
      sessionId?: string;
      label?: string;
    };

    // -- Validate -----------------------------------------------------------
    if (!pixels || !Array.isArray(pixels) || pixels.length === 0) {
      res.status(400).json({ error: "pixels array is required and must not be empty" });
      return;
    }

    const validModes: HeightMode[] = ["red", "green", "blue", "alpha", "brightness"];
    if (!heightMode || !validModes.includes(heightMode as HeightMode)) {
      res.status(400).json({ error: `heightMode must be one of: ${validModes.join(", ")}` });
      return;
    }

    // -- Generate mesh ------------------------------------------------------
    const generator = new TopographyMeshGenerator();
    const mesh = generator.generate(pixels, heightMode as HeightMode);

    // Derive dimensions from the mesh (generator computes width/height from pixel coords)
    const width = Math.max(...pixels.map(([x]) => x)) + 1;
    const height = Math.max(...pixels.map(([_, y]) => y)) + 1;

    // -- Export to buffer ---------------------------------------------------
    const exporter = new GLTFExporter();
    const glbBuffer = await exporter.exportToBuffer(mesh);

    // -- Upload to MinIO ----------------------------------------------------
    const storage = getStorage();
    const storageKey = `models/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.glb`;

    const stream = Readable.from([glbBuffer]);
    await storage.upload(storageKey, stream, glbBuffer.length, "model/gltf-binary");

    // -- Persist metadata to DB ---------------------------------------------
    const record = await repo.create({
      sessionId: sessionId ?? null,
      label: label ?? "",
      storageKey,
      heightMode: heightMode as string,
      width,
      height,
      vertexCount: mesh.vertices.length,
      fileSize: glbBuffer.length,
    });

    // -- Respond ------------------------------------------------------------
    res.status(201).json({
      ...record,
      downloadUrl: await storage.presignedUrl(record.storageKey, 86400), // 24h presigned URL
    });
  } catch (err) {
    console.error("POST /api/models/generate failed:", err);
    res.status(500).json({ error: "Failed to generate glTF model" });
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