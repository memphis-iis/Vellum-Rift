import pool from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface ProcessingJobRecord {
  jobId: string;
  modelId: string | null;
  uploadKey: string | null;
  payload: unknown; // JSONB — conversion params for upload jobs
  status: JobStatus;
  progress: number; // 0-100
  errorMessage: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

interface ProcessingJobRow {
  job_id: string;
  model_id: string | null;
  upload_key: string | null;
  payload: unknown;
  status: string;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toRecord(row: ProcessingJobRow): ProcessingJobRecord {
  return {
    jobId: row.job_id,
    modelId: row.model_id,
    uploadKey: row.upload_key,
    payload: row.payload,
    status: row.status as JobStatus,
    progress: row.progress,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class JobRepository {
  /**
   * Insert a new processing_jobs row and return the persisted record.
   */
  async create(params: {
    jobId?: string;
    modelId?: string | null;
    uploadKey?: string | null;
    payload?: unknown;
    status?: JobStatus;
    progress?: number;
  }): Promise<ProcessingJobRecord> {
    const jobId = params.jobId ?? crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO processing_jobs
         (job_id, model_id, upload_key, payload, status, progress)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        jobId,
        params.modelId ?? null,
        params.uploadKey ?? null,
        params.payload ?? null,
        params.status ?? "pending",
        params.progress ?? 0,
      ],
    );
    return toRecord(result.rows[0] as ProcessingJobRow);
  }

  /**
   * Find a job by its ID. Returns null when not found.
   */
  async findById(jobId: string): Promise<ProcessingJobRecord | null> {
    const result = await pool.query(
      `SELECT * FROM processing_jobs WHERE job_id = $1`,
      [jobId],
    );
    if (result.rows.length === 0) return null;
    return toRecord(result.rows[0] as ProcessingJobRow);
  }

  /**
   * Update the status and/or progress of a job.
   */
  async update(
    jobId: string,
    params: {
      status?: JobStatus;
      progress?: number;
      errorMessage?: string | null;
      modelId?: string | null;
      uploadKey?: string | null;
      payload?: unknown;
    },
  ): Promise<ProcessingJobRecord | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    let idx = 1;

    if (params.status !== undefined) {
      sets.push(`status = ${idx++}`);
      values.push(params.status);
    }
    if (params.progress !== undefined) {
      sets.push(`progress = ${idx++}`);
      values.push(params.progress);
    }
    if (params.errorMessage !== undefined) {
      sets.push(`error_message = ${idx++}`);
      values.push(params.errorMessage);
    }
    if (params.modelId !== undefined) {
      sets.push(`model_id = ${idx++}`);
      values.push(params.modelId);
    }
    if (params.uploadKey !== undefined) {
      sets.push(`upload_key = ${idx++}`);
      values.push(params.uploadKey);
    }
    if (params.payload !== undefined) {
      sets.push(`payload = ${idx++}::jsonb`);
      values.push(JSON.stringify(params.payload));
    }

    if (sets.length === 0) {
      return this.findById(jobId);
    }

    sets.push(`updated_at = NOW()`);
    values.push(jobId);

    const result = await pool.query(
      `UPDATE processing_jobs SET ${sets.join(", ")} WHERE job_id = ${idx} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) return null;
    return toRecord(result.rows[0] as ProcessingJobRow);
  }

  /**
   * List jobs with optional status filter, ordered by most recent first.
   */
  async list(params?: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }): Promise<ProcessingJobRecord[]> {
    const where: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    if (params?.status) {
      where.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM processing_jobs ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );
    return (result.rows as ProcessingJobRow[]).map(toRecord);
  }

  /**
   * Permanently remove a job row. Returns true if a row was deleted.
   */
  async delete(jobId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM processing_jobs WHERE job_id = $1`,
      [jobId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
