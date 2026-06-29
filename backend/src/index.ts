import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import winston from "winston";

import pool, { checkConnection } from "./lib/db.js";
import { initSchema } from "./lib/schema.js";
import gameStateRouter from "./routes/gameState.js";
import gltfModelRouter from "./routes/gltfModel.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

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
app.get("/api/health", async (_req, res) => {
  const dbOk = await checkConnection();
  res.json({
    status: dbOk ? "ok" : "degraded",
    service: "backend",
    environment: process.env.NODE_ENV ?? "development",
    database: dbOk ? "connected" : "disconnected",
  });
});

app.use("/api/game-state", gameStateRouter);
app.use("/api/models", gltfModelRouter);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

// Ensure the game_sessions table exists before accepting traffic.
initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}/api`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database schema:", err);
    process.exit(1);
  });