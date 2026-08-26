// ---------------------------------------------------------------------------
// Asset Manifest Schema — IMPL-004 + IMPL-005 (LoD tiers)
// Defines the contract for progressive chunked loading of 3D assets.
// Clients fetch this manifest to discover available chunks and their metadata.
// ---------------------------------------------------------------------------

import type { LoDTier } from "./lodTiers.js";

/** Spatial region within the source image (pixel coordinates). */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Descriptor for a single chunk of an asset. */
export interface ChunkDescriptor {
  /** Unique identifier within this asset (e.g., "chunk-tl", "chunk-tr"). */
  chunkId: string;
  /** Spatial bounds in source pixel coordinates. */
  region: Region;
  /** Full URL to download the .glb chunk. */
  url: string;
  /** File size of this chunk in bytes. */
  sizeBytes: number;
  /** Number of vertices in this chunk's mesh. */
  vertexCount: number;
  /** Load order (1 = highest priority, loaded first). */
  priority: number;
  /** Chunk IDs that must load before this one (for dependency chains). */
  dependencies?: string[];
}

/** LoD variant descriptor — one entry per tier in the manifest. */
export interface LodVariant {
  /** URL to download the .glb for this LoD tier. */
  url: string;
  /** Number of vertices in this tier's mesh. */
  vertexCount: number;
  /** File size in bytes. */
  sizeBytes: number;
}

/** Top-level asset manifest returned by GET /api/assets/:assetId/manifest. */
export interface AssetManifest {
  /** Unique identifier for the source asset (PDF page). */
  assetId: string;
  /** Manifest schema version (semver). */
  version: string;
  /** Original filename for traceability. */
  sourceFile: string;
  /** Total number of chunks in this manifest. */
  totalChunks: number;
  /** Sum of all chunk sizes in bytes. */
  totalSizeBytes: number;
  /** Timestamp of manifest generation (ISO 8601). */
  generatedAt: string;
  /** Array of chunk descriptors. */
  chunks: ChunkDescriptor[];
  /** LoD variants keyed by tier name (e.g., "quest", "balanced", "high", "archival"). */
  lods?: Record<LoDTier, LodVariant>;
  /** Default LoD tier when client doesn't specify one. */
  defaultTier?: LoDTier;
}

/** DB row shape for asset_manifests table. */
export interface AssetManifestRow {
  asset_id: string;
  version: string;
  source_file: string;
  total_chunks: number;
  total_size_bytes: number;
  generated_at: string;
  chunks_json: string; // JSONB serialized ChunkDescriptor[]
  lods_json: string; // JSONB serialized Record<LoDTier, LodVariant>
  default_tier: string;
}

/** DB row shape for individual chunk metadata (optional, for querying). */
export interface AssetChunkRow {
  asset_id: string;
  chunk_id: string;
  region_x: number;
  region_y: number;
  region_width: number;
  region_height: number;
  storage_key: string;
  size_bytes: number;
  vertex_count: number;
  priority: number;
}
