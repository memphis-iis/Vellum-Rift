import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "backend",
    environment: process.env.NODE_ENV ?? "development"
  });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}/api`);
});
