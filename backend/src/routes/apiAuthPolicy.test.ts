import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

import { requireAuth, BLUEKEY_CONFIG } from "../lib/auth.js";
import jobsRouter from "./jobs.js";
import assetManifestRouter from "./assetManifest.js";
import lodTiersRouter from "./lodTiers.js";

/**
 * Confirms the route-family auth policy from docs/reference/authentication.md:
 * jobs, assets, and lod-tiers are protected when AUTH_REQUIRED=true.
 */
describe("API auth policy (AUTH_REQUIRED=true)", () => {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/jobs", requireAuth, jobsRouter);
  app.use("/api/assets", requireAuth, assetManifestRouter);
  app.use("/api/lod-tiers", requireAuth, lodTiersRouter);

  beforeEach(() => {
    BLUEKEY_CONFIG.required = true;
  });

  afterEach(() => {
    BLUEKEY_CONFIG.required = false;
  });

  it("keeps health public", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("returns 401 for /api/jobs without a token", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("returns 401 for /api/assets without a token", async () => {
    const res = await request(app).get("/api/assets/manifests");
    expect(res.status).toBe(401);
  });

  it("returns 401 for /api/lod-tiers without a token", async () => {
    const res = await request(app).get("/api/lod-tiers");
    expect(res.status).toBe(401);
  });
});
