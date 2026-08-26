import { Router, type Request, type Response } from "express";
import { AssetManifestRepository } from "../lib/assetManifestRepository.js";

const router = Router();
const repo = new AssetManifestRepository();

/** Safely extract a string route param (Express v5 types union string | string[]). */
const param = (req: Request, name: string): string =>
  String(req.params[name]);

// ---------------------------------------------------------------------------
// GET /api/assets/:assetId/manifest
//   Return the asset manifest for progressive chunked loading.
//   Optional ?tier=quest filters to a specific LoD tier.
// ---------------------------------------------------------------------------
router.get("/:assetId/manifest", async (req: Request, res: Response) => {
  try {
    const assetId = param(req, "assetId");
    const requestedTier = req.query.tier as string | undefined;

    const manifest = await repo.findByAssetId(assetId);
    if (!manifest) {
      res.status(404).json({ error: "Asset manifest not found" });
      return;
    }

    // If a specific tier is requested, filter the response
    if (requestedTier && manifest.lods) {
      const tier = manifest.lods[requestedTier as keyof typeof manifest.lods];
      if (!tier) {
        res.status(404).json({ error: `LoD tier "${requestedTier}" not available for this asset` });
        return;
      }

      // Return a filtered manifest with just the requested tier's data
      const filteredManifest = {
        ...manifest,
        lods: { [requestedTier]: tier },
        defaultTier: requestedTier,
      };
      res.json(filteredManifest);
      return;
    }

    res.json(manifest);
  } catch (err) {
    console.error(`GET /api/assets/${req.params.assetId}/manifest failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch asset manifest" });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/assets/manifests
//   List all asset manifests.
// ---------------------------------------------------------------------------
router.get("/manifests", async (_req: Request, res: Response) => {
  try {
    const limit = _req.query.limit ? parseInt(String(_req.query.limit), 10) : 50;
    const offset = _req.query.offset ? parseInt(String(_req.query.offset), 10) : 0;

    const manifests = await repo.list({
      limit: isNaN(limit) ? 50 : limit,
      offset: isNaN(offset) ? 0 : offset,
    });

    res.json(manifests);
  } catch (err) {
    console.error("GET /api/assets/manifests failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to list asset manifests" });
    }
  }
});

export default router;
