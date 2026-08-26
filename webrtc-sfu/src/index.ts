import "dotenv/config";
import cors from "cors";
import express from "express";
import signalingRouter from "./signaling.js";
import { isRealtimePacket, PACKET_VERSION } from "./packets.js";

export const app = express();
const port = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "webrtc-sfu",
    environment: process.env.NODE_ENV ?? "development",
    signaling: true,
    mediaRelay: false,
    packetContractVersion: PACKET_VERSION,
  });
});

/** Contract discovery for clients / docs alignment checks */
app.get("/v1/contracts/packets", (_req, res) => {
  res.json({
    version: PACKET_VERSION,
    types: ["presence", "movement", "heartbeat"],
    notes:
      "JSON packets over WebRTC data channels. Media relay is not implemented in this foundation build.",
  });
});

app.post("/v1/contracts/packets/validate", (req, res) => {
  const ok = isRealtimePacket(req.body);
  res.status(ok ? 200 : 400).json({ ok });
});

app.use("/v1", signalingRouter);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`WebRTC SFU signaling listening on http://localhost:${port}/health`);
  });
}
