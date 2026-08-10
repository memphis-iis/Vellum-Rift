import winston from "winston";
import { Readable } from "node:stream";

import { JobRepository, type ProcessingJobRecord, type JobStatus } from "./jobRepository.js";
import { GlTFModelRepository } from "./gltfModelRepository.js";
import { getStorage } from "./storage.js";
import { TopographyMeshGenerator, GLTFExporter, type PixelDataTuple, type HeightMode } from "../scripts/imageArrayToOBJ.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateJobPayload {
  pixels: PixelDataTuple[];
  heightMode: HeightMode;
  sessionId?: string | null;
  label?: string;
}

export interface JobEntry {
  jobId: string;
  payload: GenerateJobPayload;
}

// ---------------------------------------------------------------------------
// JobQueue — in-memory FIFO queue with configurable worker pool
// ---------------------------------------------------------------------------

export class JobQueue {
  private queue: JobEntry[] = [];
  private workers: Promise<void>[] = [];
  private running = false;
  private jobRepo: JobRepository;
  private modelRepo: GlTFModelRepository;
  private generator: TopographyMeshGenerator;
  private exporter: GLTFExporter;

  constructor(private concurrency = 2) {
    this.jobRepo = new JobRepository();
    this.modelRepo = new GlTFModelRepository();
    this.generator = new TopographyMeshGenerator();
    this.exporter = new GLTFExporter();
  }

  /**
   * Start the worker pool. Must be called once at server startup.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.concurrency; i++) {
      this.workers.push(this.workerLoop(i));
    }
    logger.info(`JobQueue started with ${this.concurrency} worker(s)`);
  }

  /**
   * Gracefully stop the worker pool. Waits for in-flight jobs to finish.
   */
  async stop(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.workers);
    logger.info("JobQueue stopped");
  }

  /**
   * Enqueue a new job and persist it as "pending" in the DB.
   * Returns the job ID immediately (non-blocking).
   */
  async enqueue(payload: GenerateJobPayload): Promise<string> {
    const jobId = crypto.randomUUID();
    const entry: JobEntry = { jobId, payload };

    // Persist to DB as pending
    await this.jobRepo.create({ jobId, status: "pending", progress: 0 });

    // Push to in-memory queue
    this.queue.push(entry);

    logger.info(`Job ${jobId} enqueued (queue length: ${this.queue.length})`);
    return jobId;
  }

  /**
   * Get the current status of a job.
   */
  async getStatus(jobId: string): Promise<ProcessingJobRecord | null> {
    return this.jobRepo.findById(jobId);
  }

  /**
   * List jobs with optional filtering.
   */
  async listJobs(params?: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }): Promise<ProcessingJobRecord[]> {
    return this.jobRepo.list(params);
  }

  // ---------------------------------------------------------------------------
  // Internal: worker loop
  // ---------------------------------------------------------------------------

  private async workerLoop(workerId: number): Promise<void> {
    while (this.running) {
      if (this.queue.length === 0) {
        await sleep(250); // idle poll interval
        continue;
      }

      const entry = this.queue.shift();
      if (!entry) continue;

      try {
        await this.processJob(entry, workerId);
      } catch (err) {
        logger.error(`Worker ${workerId} crashed on job ${entry.jobId}`, { error: String(err) });
        // Ensure the job is marked failed even if the update itself throws
        try {
          await this.jobRepo.update(entry.jobId, {
            status: "failed",
            progress: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        } catch (updateErr) {
          logger.error(`Failed to update job ${entry.jobId} status`, { error: String(updateErr) });
        }
      }
    }
  }

  private async processJob(entry: JobEntry, workerId: number): Promise<void> {
    const { jobId, payload } = entry;
    logger.info(`Worker ${workerId} processing job ${jobId}`);

    // Mark as processing
    await this.jobRepo.update(jobId, { status: "processing", progress: 10 });

    try {
      // Step 1: Generate mesh (20%)
      const mesh = this.generator.generate(payload.pixels, payload.heightMode);
      await this.jobRepo.update(jobId, { progress: 30 });

      // Step 2: Export to glb buffer (50%)
      const glbBuffer = await this.exporter.exportToBuffer(mesh);
      await this.jobRepo.update(jobId, { progress: 50 });

      // Derive dimensions
      const width = Math.max(...payload.pixels.map(([x]) => x)) + 1;
      const height = Math.max(...payload.pixels.map(([, y]) => y)) + 1;

      // Step 3: Upload to MinIO (70%)
      const storage = getStorage();
      const safeLabel = (payload.label ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `models/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.glb`;

      const stream = Readable.from([glbBuffer]);
      await storage.upload(storageKey, stream, glbBuffer.length, "model/gltf-binary");
      await this.jobRepo.update(jobId, { progress: 70 });

      // Step 4: Persist model metadata to DB (90%)
      const modelRecord = await this.modelRepo.create({
        sessionId: payload.sessionId ?? null,
        label: safeLabel || "",
        storageKey,
        heightMode: payload.heightMode,
        width,
        height,
        vertexCount: mesh.vertices.length,
        fileSize: glbBuffer.length,
      });

      // Step 5: Link model to job (100%)
      await this.jobRepo.update(jobId, {
        status: "completed",
        progress: 100,
        modelId: modelRecord.modelId,
      });

      logger.info(`Job ${jobId} completed → modelId=${modelRecord.modelId}`);
    } catch (err) {
      await this.jobRepo.update(jobId, {
        status: "failed",
        progress: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error(`Job ${jobId} failed`, { error: String(err) });
      throw err; // Re-throw so the worker loop catches it as a safety net
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
