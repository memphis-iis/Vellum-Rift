import { Router, type Request, type Response } from "express";
import { LOD_TIERS, LOD_TIER_KEYS, DEFAULT_LOD_TIER, getLoDBudget, type LoDTier } from "../lib/lodTiers.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/lod-tiers
//   List all available LoD tiers and their budgets.
// ---------------------------------------------------------------------------
router.get("/", (_req: Request, res: Response) => {
  try {
    const tiers = LOD_TIER_KEYS.map((key) => LOD_TIERS[key]);

    res.json({
      tiers,
      defaultTier: DEFAULT_LOD_TIER,
    });
  } catch (err) {
    console.error("GET /api/lod-tiers failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to list LoD tiers" });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/lod-tiers/:tier
//   Get budget details for a specific LoD tier.
// ---------------------------------------------------------------------------
router.get("/:tier", (req: Request, res: Response) => {
  try {
    const tier = String(req.params.tier);
    const budget = getLoDBudget(tier);

    res.json(budget);
  } catch (err) {
    if (!res.headersSent) {
      res.status(404).json({ error: (err as Error).message });
    }
  }
});

export default router;
