import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import winston from "winston";

import gameStateRouter from "./routes/gameState.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

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
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "backend",
    environment: process.env.NODE_ENV ?? "development"
  });
});

app.use("/api/game-state", gameStateRouter);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}/api`);
});
