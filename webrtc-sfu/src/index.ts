import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "webrtc-sfu",
    environment: process.env.NODE_ENV ?? "development"
  });
});

app.listen(port, () => {
  console.log(`WebRTC SFU placeholder listening on http://localhost:${port}/health`);
});
