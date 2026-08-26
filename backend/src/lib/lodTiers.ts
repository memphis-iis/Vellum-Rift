// ---------------------------------------------------------------------------
// LoD (Level of Detail) Tier Definitions — IMPL-005
// Platform-specific budgets for mesh generation and asset delivery.
// ---------------------------------------------------------------------------

/** Supported LoD tier identifiers. */
export type LoDTier = "archival" | "high" | "balanced" | "quest";

/** Budget constraints for a single LoD tier. */
export interface LoDBudget {
  /** Tier identifier. */
  tier: LoDTier;
  /** Maximum number of vertices allowed in the generated mesh. Infinity = no limit. */
  maxVertices: number;
  /** Maximum texture dimension in pixels (square, e.g., 2048 means 2048x2048). */
  maxTextureSize: number;
  /** Height scale multiplier for bump mapping at this tier. */
  heightScale: number;
  /** Human-readable target platform description. */
  targetPlatform: string;
}

/**
 * Canonical LoD tier definitions.
 * These are the source of truth for all mesh generation and asset delivery.
 */
export const LOD_TIERS: Record<LoDTier, LoDBudget> = {
  archival: {
    tier: "archival",
    maxVertices: Infinity,
    maxTextureSize: 4096,
    heightScale: 1.0,
    targetPlatform: "reference/storage",
  },
  high: {
    tier: "high",
    maxVertices: 2_000_000,
    maxTextureSize: 2048,
    heightScale: 1.5,
    targetPlatform: "desktop/steamvr",
  },
  balanced: {
    tier: "balanced",
    maxVertices: 500_000,
    maxTextureSize: 1024,
    heightScale: 1.2,
    targetPlatform: "webgl/mobile",
  },
  quest: {
    tier: "quest",
    maxVertices: 100_000,
    maxTextureSize: 512,
    heightScale: 0.8,
    targetPlatform: "meta-quest",
  },
};

/** Default LoD tier when none is specified by the client. */
export const DEFAULT_LOD_TIER: LoDTier = "balanced";

/** All tier keys in priority order (highest fidelity first). */
export const LOD_TIER_KEYS: LoDTier[] = ["archival", "high", "balanced", "quest"];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Get the budget for a given tier. Throws if the tier is invalid.
 */
export function getLoDBudget(tier: string): LoDBudget {
  const budget = LOD_TIERS[tier as LoDTier];
  if (!budget) {
    throw new Error(
      `Invalid LoD tier "${tier}". Must be one of: ${LOD_TIER_KEYS.join(", ")}`,
    );
  }
  return budget;
}

/**
 * Check if a mesh vertex count is within the budget for a given tier.
 */
export function validateBudget(vertexCount: number, tier: LoDTier): {
  withinBudget: boolean;
  budget: LoDBudget;
  excessVertices?: number;
} {
  const budget = LOD_TIERS[tier];
  const withinBudget = vertexCount <= budget.maxVertices;
  return {
    withinBudget,
    budget,
    excessVertices: withinBudget ? undefined : vertexCount - budget.maxVertices,
  };
}

/**
 * Calculate the subsampling factor needed to bring a mesh within budget.
 * Returns 1.0 if already within budget.
 */
export function calculateSubsampleFactor(vertexCount: number, tier: LoDTier): number {
  const budget = LOD_TIERS[tier];
  if (vertexCount <= budget.maxVertices) return 1.0;

  // Subsample ratio: sqrt of vertex ratio (since vertices scale with area)
  const ratio = Math.sqrt(budget.maxVertices / vertexCount);
  return Math.max(ratio, 0.1); // Never subsample below 10%
}
