import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

import lodTiersRouter from "./lodTiers.js";

describe("LoD Tiers Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/lod-tiers", lodTiersRouter);
  });

  describe("GET /api/lod-tiers", () => {
    it("returns all 4 tiers", async () => {
      const res = await request(app).get("/api/lod-tiers");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tiers)).toBe(true);
      expect(res.body.tiers.length).toBe(4);
      expect(res.body.defaultTier).toBe("balanced");
    });

    it("includes all tier keys", async () => {
      const res = await request(app).get("/api/lod-tiers");

      const tierNames = res.body.tiers.map((t: any) => t.tier);
      expect(tierNames).toContain("archival");
      expect(tierNames).toContain("high");
      expect(tierNames).toContain("balanced");
      expect(tierNames).toContain("quest");
    });

    it("each tier has required budget fields", async () => {
      const res = await request(app).get("/api/lod-tiers");

      for (const tier of res.body.tiers) {
        expect(tier.maxVertices).toBeDefined();
        expect(tier.maxTextureSize).toBeDefined();
        expect(tier.heightScale).toBeDefined();
        expect(tier.targetPlatform).toBeDefined();
      }
    });
  });

  describe("GET /api/lod-tiers/:tier", () => {
    it("returns quest tier budget", async () => {
      const res = await request(app).get("/api/lod-tiers/quest");

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe("quest");
      expect(res.body.maxVertices).toBe(100_000);
      expect(res.body.maxTextureSize).toBe(512);
    });

    it("returns archival tier with unlimited vertices", async () => {
      const res = await request(app).get("/api/lod-tiers/archival");

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe("archival");
      expect(Number.isFinite(res.body.maxVertices)).toBe(false); // Infinity
    });

    it("returns 404 for invalid tier", async () => {
      const res = await request(app).get("/api/lod-tiers/invalid-tier");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Invalid LoD tier");
    });
  });
});
