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

/** Summary of a single job for the processing-status endpoint. */
export interface JobSummary {
  jobId: string;
  modelId: string | null;
  status: JobStatus;
  progress: number;
  errorMessage: string | null;
}

/** Aggregate processing status for all jobs in a session. */
export interface SessionProcessingStatus {
  sessionId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  processingJobs: number;
  overallProgress: number; // 0-100
  isReady: boolean;
  jobs: JobSummary[];
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

  /**
   * Find all jobs linked to models in a given session.
   * Joins gltf_models(session_id) → processing_jobs(model_id).
   */
  async findBySession(sessionId: string): Promise<JobSummary[]> {
    const result = await pool.query(
      `SELECT pj.job_id, pj.model_id, pj.status, pj.progress, pj.error_message
       FROM processing_jobs pj
       JOIN gltf_models gm ON pj.model_id = gm.model_id
       WHERE gm.session_id = $1
       ORDER BY pj.created_at DESC`,
      [sessionId],
    );

    return (result.rows as Array<{
      job_id: string;
      model_id: string | null;
      status: string;
      progress: number;
      error_message: string | null;
    }>).map((row) => ({
      jobId: row.job_id,
      modelId: row.model_id,
      status: row.status as JobStatus,
      progress: row.progress,
      errorMessage: row.error_message,
    }));
  }

  /**
   * Compute aggregate processing status for all jobs in a session.
   */
  async getSessionProcessingStatus(sessionId: string): Promise<SessionProcessingStatus> {
    const jobs = await this.findBySession(sessionId);

    const totalJobs = jobs.length;
    const completedJobs = jobs.filter((j) => j.status === "completed").length;
    const failedJobs = jobs.filter((j) => j.status === "failed").length;
    const pendingJobs = jobs.filter((j) => j.status === "pending").length;
    const processingJobs = jobs.filter((j) => j.status === "processing").length;

    // Weighted average progress across all jobs
    const overallProgress = totalJobs === 0
      ? 100 // Empty session is considered ready
      : Math.round(jobs.reduce((sum, j) => sum + j.progress, 0) / totalJobs);

    // Session is ready when all jobs are completed (none pending or processing)
    const isReady = totalJobs === 0 || (pendingJobs === 0 && processingJobs === 0);

    return {
      sessionId,
      totalJobs,
      completedJobs,
      failedJobs,
      pendingJobs,
      processingJobs,
      overallProgress,
      isReady,
      jobs,
    };
  }
}
