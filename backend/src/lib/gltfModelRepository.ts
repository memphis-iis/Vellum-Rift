import pool from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlTFModelRecord {
  modelId: string;
  sessionId: string | null;
  label: string;
  storageKey: string;
  heightMode: string;
  width: number;
  height: number;
  vertexCount: number;
  fileSize: number;
  createdAt: string; // ISO-8601
}

interface GlTFModelRow {
  model_id: string;
  session_id: string | null;
  label: string;
  storage_key: string;
  height_mode: string;
  width: number;
  height: number;
  vertex_count: number;
  file_size: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toRecord(row: GlTFModelRow): GlTFModelRecord {
  return {
    modelId: row.model_id,
    sessionId: row.session_id,
    label: row.label,
    storageKey: row.storage_key,
    heightMode: row.height_mode,
    width: row.width,
    height: row.height,
    vertexCount: row.vertex_count,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class GlTFModelRepository {
  /**
   * Insert a new gltf_models row and return the persisted record.
   */
  async create(params: {
    sessionId?: string | null;
    label: string;
    storageKey: string;
    heightMode: string;
    width: number;
    height: number;
    vertexCount: number;
    fileSize: number;
  }): Promise<GlTFModelRecord> {
    const result = await pool.query(
      `INSERT INTO gltf_models
         (session_id, label, storage_key, height_mode, width, height, vertex_count, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.sessionId ?? null,
        params.label,
        params.storageKey,
        params.heightMode,
        params.width,
        params.height,
        params.vertexCount,
        params.fileSize,
      ],
    );
    return toRecord(result.rows[0] as GlTFModelRow);
  }

  /**
   * Find a model by its ID. Returns null when not found.
   */
  async findById(modelId: string): Promise<GlTFModelRecord | null> {
    const result = await pool.query(
      `SELECT * FROM gltf_models WHERE model_id = $1`,
      [modelId],
    );
    if (result.rows.length === 0) return null;
    return toRecord(result.rows[0] as GlTFModelRow);
  }

  /**
   * List models optionally filtered by session_id.
   */
  async findBySession(sessionId: string): Promise<GlTFModelRecord[]> {
    const result = await pool.query(
      `SELECT * FROM gltf_models WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId],
    );
    return (result.rows as GlTFModelRow[]).map(toRecord);
  }

  /**
   * List recent models (newest first).
   */
  async list(params?: { limit?: number; offset?: number }): Promise<GlTFModelRecord[]> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;
    const result = await pool.query(
      `SELECT * FROM gltf_models ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return (result.rows as GlTFModelRow[]).map(toRecord);
  }

  /**
   * Permanently remove a model row. Returns true if a row was deleted.
   */
  async delete(modelId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM gltf_models WHERE model_id = $1`,
      [modelId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
