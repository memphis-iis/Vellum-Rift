import winston from "winston";
import { Readable } from "node:stream";
import crypto from "node:crypto";

import { JobRepository, type ProcessingJobRecord, type JobStatus } from "./jobRepository.js";
import { GlTFModelRepository } from "./gltfModelRepository.js";
import { getStorage } from "./storage.js";
import { TopographyMeshGenerator, GLTFExporter, type PixelDataTuple, type HeightMode } from "../scripts/imageArrayToOBJ.js";
import { ImageTo3DArray } from "../scripts/imageTo3DArray.js";

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

export interface UploadJobPayload {
  /** MinIO key of the raw uploaded file */
  uploadKey: string;
  /** Detected MIME type (e.g. "application/pdf", "image/png") */
  fileType: string;
  heightMode: HeightMode;
  heightScale?: number;
  page?: number;
  sessionId?: string | null;
  label?: string;
}

export type JobPayload =
  | { type: "generate"; payload: GenerateJobPayload }
  | { type: "upload"; payload: UploadJobPayload };

export interface JobEntry {
  jobId: string;
  jobPayload: JobPayload;
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
  private converter: ImageTo3DArray;

  constructor(private concurrency = 2) {
    this.jobRepo = new JobRepository();
    this.modelRepo = new GlTFModelRepository();
    this.generator = new TopographyMeshGenerator();
    this.exporter = new GLTFExporter();
    this.converter = new ImageTo3DArray();
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
   * Enqueue a "generate" job (pixels already available).
   * Returns the job ID immediately (non-blocking).
   */
  async enqueueGenerate(payload: GenerateJobPayload): Promise<string> {
    const jobId = crypto.randomUUID();
    const entry: JobEntry = { jobId, jobPayload: { type: "generate", payload } };

    await this.jobRepo.create({ jobId, status: "pending", progress: 0 });
    this.queue.push(entry);

    logger.info(`Job ${jobId} enqueued (type=generate, queue length: ${this.queue.length})`);
    return jobId;
  }

  /**
   * Enqueue an "upload" job (raw file in MinIO, needs conversion).
   * Returns the job ID immediately (non-blocking).
   */
  async enqueueUpload(payload: UploadJobPayload): Promise<string> {
    const jobId = crypto.randomUUID();
    const entry: JobEntry = { jobId, jobPayload: { type: "upload", payload } };

    await this.jobRepo.create({
      jobId,
      status: "pending",
      progress: 0,
      uploadKey: payload.uploadKey,
      payload: { type: "upload", ...payload },
    });
    this.queue.push(entry);

    logger.info(`Job ${jobId} enqueued (type=upload, queue length: ${this.queue.length})`);
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
    const { jobId, jobPayload } = entry;

    if (jobPayload.type === "generate") {
      await this.processGenerateJob(jobId, jobPayload.payload, workerId);
    } else {
      await this.processUploadJob(jobId, jobPayload.payload, workerId);
    }
  }

  // ---------------------------------------------------------------------------
  // Generate job: pixels → mesh → glb → MinIO → DB
  // ---------------------------------------------------------------------------

  private async processGenerateJob(
    jobId: string,
    payload: GenerateJobPayload,
    workerId: number,
  ): Promise<void> {
    logger.info(`Worker ${workerId} processing generate job ${jobId}`);

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

      logger.info(`Generate job ${jobId} completed → modelId=${modelRecord.modelId}`);
    } catch (err) {
      await this.jobRepo.update(jobId, {
        status: "failed",
        progress: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error(`Generate job ${jobId} failed`, { error: String(err) });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Upload job: download raw file → convert → mesh → glb → MinIO → DB
  // ---------------------------------------------------------------------------

  private async processUploadJob(
    jobId: string,
    payload: UploadJobPayload,
    workerId: number,
  ): Promise<void> {
    logger.info(`Worker ${workerId} processing upload job ${jobId}`);

    await this.jobRepo.update(jobId, { status: "processing", progress: 10 });

    const storage = getStorage();

    try {
      // Step 1: Download raw file from MinIO (20%)
      const rawBuffer = await storage.downloadBuffer(payload.uploadKey);
      await this.jobRepo.update(jobId, { progress: 20 });

      // Step 2: Convert to pixels (40%)
      const pixels =
        payload.fileType === "application/pdf"
          ? await this.converter.pdf2ArrayFromBuffer(rawBuffer, payload.page ?? 1)
          : await this.converter.img2ArrayFromBuffer(rawBuffer);

      if (pixels.length === 0) {
        throw new Error("No pixels could be extracted from the uploaded file");
      }

      await this.jobRepo.update(jobId, { progress: 40 });

      // Step 3: Generate mesh (55%)
      const heightScale = payload.heightScale ?? 1;
      const mesh = this.generator.generate(pixels, payload.heightMode, heightScale);
      await this.jobRepo.update(jobId, { progress: 55 });

      // Step 4: Export to glb buffer (70%)
      const glbBuffer = await this.exporter.exportToBuffer(mesh);
      await this.jobRepo.update(jobId, { progress: 70 });

      // Derive dimensions
      let maxX = 0;
      let maxY = 0;
      for (const [x, y] of pixels) {
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const width = maxX + 1;
      const height = maxY + 1;

      // Step 5: Upload processed GLB to MinIO (80%)
      const storageKey = `models/${Date.now()}-${crypto.randomUUID()}.glb`;
      const stream = Readable.from([glbBuffer]);
      await storage.upload(storageKey, stream, glbBuffer.length, "model/gltf-binary");
      await this.jobRepo.update(jobId, { progress: 80 });

      // Step 6: Persist model metadata to DB (90%)
      const safeLabel = (payload.label ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
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

      // Step 7: Link model to job (100%)
      await this.jobRepo.update(jobId, {
        status: "completed",
        progress: 100,
        modelId: modelRecord.modelId,
      });

      logger.info(`Upload job ${jobId} completed → modelId=${modelRecord.modelId}`);
    } catch (err) {
      // Clean up raw file on failure
      try {
        await storage.remove(payload.uploadKey);
        logger.info(`Cleaned up raw upload ${payload.uploadKey} after job ${jobId} failure`);
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up raw upload ${payload.uploadKey}`, { error: String(cleanupErr) });
      }

      await this.jobRepo.update(jobId, {
        status: "failed",
        progress: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error(`Upload job ${jobId} failed`, { error: String(err) });
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}