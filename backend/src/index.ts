// Load .env BEFORE any other module evaluates (ESM imports are hoisted, so
// env vars read at import time in other modules would otherwise see nothing).
import "dotenv/config";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import winston from "winston";

import { checkConnection } from "./lib/db.js";
import { initSchema } from "./lib/schema.js";
import { SampleModelIngestor } from "./lib/sampleModelIngestor.js";
import { JobQueue } from "./lib/jobQueue.js";
import gameStateRouter from "./routes/gameState.js";
import gltfModelRouter, { setJobQueue as setGltfJobQueue } from "./routes/gltfModel.js";
import jobsRouter, { setJobQueue as setJobsJobQueue } from "./routes/jobs.js";
import { getGameStateStats } from "./components/gameState.js";
import { GameStateRepository } from "./lib/gameStateRepository.js";
import { requireAuth } from "./lib/auth.js";
import uploadRouter, { setJobQueue as setUploadJobQueue } from "./routes/upload.js";
import assetManifestRouter from "./routes/assetManifest.js";
import lodTiersRouter from "./routes/lodTiers.js";

dotenv.config();

export const app = express();
const port = Number(process.env.PORT ?? 4000);

const gameStateRepo = new GameStateRepository();

app.use(cors());
// Models can carry large pixel arrays — bump the JSON body limit to 50 MB.
app.use(express.json({ limit: "50mb" }));


// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Middleware to log incoming requests and IP
app.use((req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  logger.info(`Incoming request: ${req.method} ${req.url} from IP: ${clientIp}`);
  next();
});

// Health check endpoint
const healthHandler = async (
  _req: express.Request,
  res: express.Response,
) => {
  const dbOk = await checkConnection();
  const sessions = dbOk ? await gameStateRepo.findAll() : [];

  res.json({
    status: dbOk ? "ok" : "degraded",
    service: "backend",
    environment: process.env.NODE_ENV ?? "development",
    gameState: getGameStateStats(sessions),
  });
};

// Public routes (no auth required)
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// ---------------------------------------------------------------------------
// Protected routes (require Bluekey auth when AUTH_REQUIRED=true)
// Policy: only /health and /api/health are public. See docs/reference/authentication.md.
// ---------------------------------------------------------------------------
// To add a new protected route or router:
//
//   1. Import requireAuth:
//      import { requireAuth } from "./lib/auth.js";
//
//   2. Apply it as middleware before your handler or router:
//      app.post("/api/upload", requireAuth, uploadHandler);
//      app.use("/api/upload", requireAuth, uploadRouter);
//
//   3. Access the authenticated user in your handler via req.user:
//      const userId = req.user!.sub;
//      const email  = req.user!.email;
//
// In development (AUTH_REQUIRED unset), requireAuth silently attaches a stub
// user so you can build features without a real Bluekey token.
// When AUTH_REQUIRED=true, protected routes return 401 without a valid token.
// Shared/test hosts MUST set AUTH_REQUIRED=true.
// ---------------------------------------------------------------------------
app.use("/api/game-state", requireAuth, gameStateRouter);
app.use("/api/models", requireAuth, gltfModelRouter);
app.use("/api/upload", requireAuth, uploadRouter);
app.use("/api/jobs", requireAuth, jobsRouter);
app.use("/api/assets", requireAuth, assetManifestRouter);
app.use("/api/lod-tiers", requireAuth, lodTiersRouter);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

// Ensure the game_sessions table exists before accepting traffic.
initSchema()
  .then(() => {
    // Ingest sample PDFs/images from src/sample/pdfs/ on startup
    const ingestor = new SampleModelIngestor();
    return ingestor.ingestAll().catch((err) => {
      logger.warn("Sample model ingestion failed (non-fatal):", err);
      return [];
    });
  })
  .then(() => {
    // Start the async job queue (concurrency from env or default 2)
    const concurrency = Number(process.env.JOB_QUEUE_CONCURRENCY ?? 2);
    const jobQueue = new JobQueue(concurrency);
    jobQueue.start();

    // Register the queue with routes that need it
    setGltfJobQueue(jobQueue);
    setJobsJobQueue(jobQueue);
    setUploadJobQueue(jobQueue);

    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}/api`);
      console.log(`Health check endpoint: http://localhost:${port}/health`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database schema:", err);
    process.exit(1);
  });