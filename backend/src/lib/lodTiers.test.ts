import { describe, it, expect } from "vitest";
import {
  LOD_TIERS,
  LOD_TIER_KEYS,
  DEFAULT_LOD_TIER,
  getLoDBudget,
  validateBudget,
  calculateSubsampleFactor,
} from "../lib/lodTiers.js";

describe("LoD Tiers", () => {
  describe("LOD_TIERS definitions", () => {
    it("has all 4 tier keys", () => {
      expect(LOD_TIER_KEYS).toEqual(["archival", "high", "balanced", "quest"]);
    });

    it("default tier is balanced", () => {
      expect(DEFAULT_LOD_TIER).toBe("balanced");
    });

    it("archival has unlimited vertices", () => {
      expect(LOD_TIERS.archival.maxVertices).toBe(Infinity);
    });

    it("quest has the strictest vertex budget", () => {
      const questBudget = LOD_TIERS.quest.maxVertices;
      for (const key of LOD_TIER_KEYS) {
        if (key === "archival") continue; // skip infinite
        expect(LOD_TIERS[key].maxVertices).toBeGreaterThanOrEqual(questBudget);
      }
    });

    it("quest has the smallest texture size", () => {
      const questSize = LOD_TIERS.quest.maxTextureSize;
      for (const key of LOD_TIER_KEYS) {
        expect(LOD_TIERS[key].maxTextureSize).toBeGreaterThanOrEqual(questSize);
      }
    });

    it("each tier has a valid heightScale", () => {
      for (const key of LOD_TIER_KEYS) {
        const scale = LOD_TIERS[key].heightScale;
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(2.0);
      }
    });

    it("each tier has a targetPlatform description", () => {
      for (const key of LOD_TIER_KEYS) {
        expect(LOD_TIERS[key].targetPlatform).toBeDefined();
        expect(LOD_TIERS[key].targetPlatform.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getLoDBudget", () => {
    it("returns the correct budget for a valid tier", () => {
      const budget = getLoDBudget("quest");
      expect(budget.tier).toBe("quest");
      expect(budget.maxVertices).toBe(100_000);
    });

    it("throws for an invalid tier", () => {
      expect(() => getLoDBudget("invalid")).toThrow(
        /Invalid LoD tier "invalid"/,
      );
    });
  });

  describe("validateBudget", () => {
    it("returns withinBudget=true when under limit", () => {
      const result = validateBudget(50_000, "quest");
      expect(result.withinBudget).toBe(true);
      expect(result.excessVertices).toBeUndefined();
    });

    it("returns withinBudget=false when over limit", () => {
      const result = validateBudget(200_000, "quest");
      expect(result.withinBudget).toBe(false);
      expect(result.excessVertices).toBe(100_000);
    });

    it("always returns withinBudget=true for archival tier", () => {
      const result = validateBudget(Number.MAX_SAFE_INTEGER, "archival");
      expect(result.withinBudget).toBe(true);
    });

    it("returns the correct budget object", () => {
      const result = validateBudget(100, "balanced");
      expect(result.budget.tier).toBe("balanced");
    });
  });

  describe("calculateSubsampleFactor", () => {
    it("returns 1.0 when within budget", () => {
      const factor = calculateSubsampleFactor(50_000, "quest");
      expect(factor).toBe(1.0);
    });

    it("returns a factor < 1.0 when over budget", () => {
      const factor = calculateSubsampleFactor(400_000, "quest");
      expect(factor).toBeLessThan(1.0);
      expect(factor).toBeGreaterThan(0);
    });

    it("never returns a factor below 0.1", () => {
      const factor = calculateSubsampleFactor(Number.MAX_SAFE_INTEGER, "quest");
      expect(factor).toBeGreaterThanOrEqual(0.1);
    });

    it("returns 1.0 for archival tier regardless of vertex count", () => {
      const factor = calculateSubsampleFactor(Number.MAX_SAFE_INTEGER, "archival");
      expect(factor).toBe(1.0);
    });
  });
});
