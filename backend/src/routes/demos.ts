/**
 * Public Try now catalog (platform Demos library exhibits).
 */

import { Router, type Request, type Response } from "express";
import { requireAuth, isKioskGuest } from "../lib/auth.js";
import { isDemoAdmin } from "../lib/demoAdmins.js";
import { isPublicDemoModel, listAvailableDemos } from "../lib/demoCatalog.js";
import { checkRateLimit } from "../lib/kioskRateLimit.js";
import { getStorage } from "../lib/storage.js";

const router = Router();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

export type DemoCatalogItem = {
  sessionId: string;
  modelId: string;
  label: string;
  category: string;
  summary: string;
  updatedAt: string;
  /** Public GLB URL path for catalog <model-viewer> previews (no auth). */
  previewUrl: string;
};

/**
 * GET /api/demos — public list of available Demos-folder exhibits.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = checkRateLimit(`demos-list:${clientIp(req)}`, 60, 60_000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res.status(429).json({
        error: "Too many demo list requests. Try again shortly.",
        retryAfterSec: limit.retryAfterSec,
      });
      return;
    }

    const demos = await listAvailableDemos();
    const categories = [...new Set(demos.map((d) => d.category))];
    res.json({
      demos: demos.map((d) => ({
        ...d,
        previewUrl: `/api/demos/${encodeURIComponent(d.modelId)}/glb`,
      })),
      categories,
    });
  } catch (err) {
    console.error("GET /api/demos failed:", err);
    res.status(500).json({ error: "Failed to list demos" });
  }
});

/**
 * GET /api/demos/admin-status — whether the caller may manage Demos / Try now.
 * Registered before /:modelId/glb so "admin-status" is not captured as an id.
 */
router.get("/admin-status", requireAuth, (req: Request, res: Response) => {
  if (isKioskGuest(req.user)) {
    res.json({ isAdmin: false });
    return;
  }
  res.json({ isAdmin: isDemoAdmin(req.user?.email) });
});

/**
 * GET /api/demos/:modelId/glb — public binary for Try now catalog previews.
 * Only serves models that are currently listed (try-now + Demos folder + ready).
 */
router.get("/:modelId/glb", async (req: Request, res: Response) => {
  try {
    const limit = checkRateLimit(`demos-glb:${clientIp(req)}`, 120, 60_000);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res.status(429).json({
        error: "Too many demo preview requests. Try again shortly.",
        retryAfterSec: limit.retryAfterSec,
      });
      return;
    }

    const modelId = String(req.params.modelId ?? "").trim();
    if (!modelId) {
      res.status(400).json({ error: "modelId is required" });
      return;
    }

    const gate = await isPublicDemoModel(modelId);
    if (!gate.ok) {
      res.status(404).json({ error: "Demo not found" });
      return;
    }

    const storage = getStorage();
    const downloadStream = await storage.download(gate.model.storageKey);
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${modelId}.glb"`,
    );
    (downloadStream as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    console.error("GET /api/demos/:modelId/glb failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to serve demo preview" });
    }
  }
});

export default router;
