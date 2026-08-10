import pool from "./db.js";
import type { AssetManifest, AssetManifestRow } from "./assetManifest.js";

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toManifest(row: AssetManifestRow): AssetManifest {
  return {
    assetId: row.asset_id,
    version: row.version,
    sourceFile: row.source_file,
    totalChunks: row.total_chunks,
    totalSizeBytes: Number(row.total_size_bytes),
    generatedAt: row.generated_at,
    chunks: JSON.parse(row.chunks_json as string),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AssetManifestRepository {
  /**
   * Create or replace an asset manifest.
   */
  async upsert(manifest: AssetManifest): Promise<AssetManifest> {
    const result = await pool.query(
      `INSERT INTO asset_manifests
         (asset_id, version, source_file, total_chunks, total_size_bytes, generated_at, chunks_json)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6::jsonb)
       ON CONFLICT (asset_id) DO UPDATE SET
         version = EXCLUDED.version,
         source_file = EXCLUDED.source_file,
         total_chunks = EXCLUDED.total_chunks,
         total_size_bytes = EXCLUDED.total_size_bytes,
         generated_at = NOW(),
         chunks_json = EXCLUDED.chunks_json
       RETURNING *`,
      [
        manifest.assetId,
        manifest.version,
        manifest.sourceFile,
        manifest.totalChunks,
        manifest.totalSizeBytes,
        JSON.stringify(manifest.chunks),
      ],
    );
    return toManifest(result.rows[0] as AssetManifestRow);
  }

  /**
   * Find a manifest by asset ID. Returns null when not found.
   */
  async findByAssetId(assetId: string): Promise<AssetManifest | null> {
    const result = await pool.query(
      `SELECT * FROM asset_manifests WHERE asset_id = $1`,
      [assetId],
    );
    if (result.rows.length === 0) return null;
    return toManifest(result.rows[0] as AssetManifestRow);
  }

  /**
   * List all manifests, ordered by most recent first.
   */
  async list(params?: { limit?: number; offset?: number }): Promise<AssetManifest[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM asset_manifests ORDER BY generated_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return (result.rows as AssetManifestRow[]).map(toManifest);
  }

  /**
   * Delete a manifest by asset ID. Returns true if a row was deleted.
   */
  async delete(assetId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM asset_manifests WHERE asset_id = $1`,
      [assetId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
