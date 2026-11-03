/**
 * Public curated demo catalog (Try now) + admin status.
 */

import { Router, type Request, type Response } from "express";
import { requireAuth, isKioskGuest } from "../lib/auth.js";
import { isDemoAdmin } from "../lib/demoAdmins.js";
import { GameStateRepository } from "../lib/gameStateRepository.js";
import { readKioskEnabled } from "../lib/sessionKiosk.js";
import { readPlaylist } from "../lib/sessionPlaylist.js";
import { readSessionDemo } from "../lib/sessionDemo.js";
import { checkRateLimit } from "../lib/kioskRateLimit.js";

const router = Router();
const repo = new GameStateRepository();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

export type DemoCatalogItem = {
  sessionId: string;
  label: string;
  category: string;
  summary: string;
  activeModelId: string | null;
  playlistCount: number;
  updatedAt: string;
};

/**
 * GET /api/demos — public list of curated demo Spaces (kiosk on + playlist).
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

    const sessions = await repo.findAll();
    const demos: DemoCatalogItem[] = [];

    for (const s of sessions) {
      if (!s.isActive) continue;
      if (!readKioskEnabled(s.metadata)) continue;
      const demo = readSessionDemo(s.metadata);
      if (!demo.enabled) continue;
      const { playlist, activeModelId } = readPlaylist(s.metadata);
      if (!playlist.length) continue;
      demos.push({
        sessionId: s.sessionId,
        label: s.label?.trim() || "Untitled demo",
        category: demo.category,
        summary: demo.summary,
        activeModelId,
        playlistCount: playlist.length,
        updatedAt: s.updatedAt,
      });
    }

    demos.sort((a, b) => {
      const cat = a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
      if (cat !== 0) return cat;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });

    const categories = [...new Set(demos.map((d) => d.category))];
    res.json({ demos, categories });
  } catch (err) {
    console.error("GET /api/demos failed:", err);
    res.status(500).json({ error: "Failed to list demos" });
  }
});

/**
 * GET /api/demos/admin-status — whether the caller may curate demos.
 */
router.get("/admin-status", requireAuth, (req: Request, res: Response) => {
  if (isKioskGuest(req.user)) {
    res.json({ isAdmin: false });
    return;
  }
  res.json({ isAdmin: isDemoAdmin(req.user?.email) });
});

export default router;
