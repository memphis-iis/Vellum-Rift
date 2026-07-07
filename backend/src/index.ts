import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import winston from "winston";

import { checkConnection } from "./lib/db.js";
import { initSchema } from "./lib/schema.js";
import { SampleModelIngestor } from "./lib/sampleModelIngestor.js";
import gameStateRouter from "./routes/gameState.js";
import gltfModelRouter from "./routes/gltfModel.js";
import { getGameStateStats } from "./components/gameState.js";
import { GameStateRepository } from "./lib/gameStateRepository.js";
import { requireAuth } from "./lib/auth.js";

dotenv.config();

const app = express();
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

// Protected routes (require Bluekey auth when AUTH_REQUIRED=true)
app.use("/api/game-state", requireAuth, gameStateRouter);
app.use("/api/models", requireAuth, gltfModelRouter);

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
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}/api`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database schema:", err);
    process.exit(1);
  });