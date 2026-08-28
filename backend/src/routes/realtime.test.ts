import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { sub: "acct:test", email: "test@memphis.edu", exp: 9999999999 };
    next();
  },
  requireAuthOrKiosk: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { sub: "acct:test", email: "test@memphis.edu", exp: 9999999999 };
    next();
  },
  isKioskGuest: () => false,
}));

import { requireAuth } from "../lib/auth.js";
import realtimeRouter from "./realtime.js";

describe("POST /api/realtime/token", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/realtime", requireAuth, realtimeRouter);

  beforeEach(() => {
    process.env.REALTIME_JWT_SECRET = "test-secret";
    process.env.SFU_PUBLIC_URL = "http://localhost:4100";
  });

  it("mints a token for a session", async () => {
    const res = await request(app)
      .post("/api/realtime/token")
      .send({ sessionId: "sess-1", playerId: "player-a" });

    expect(res.status).toBe(200);
    expect(res.body.token.split(".")).toHaveLength(3);
    expect(res.body.sessionId).toBe("sess-1");
    expect(res.body.playerId).toBe("player-a");
    expect(res.body.sfuUrl).toBe("http://localhost:4100");
  });

  it("rejects missing sessionId", async () => {
    const res = await request(app).post("/api/realtime/token").send({});
    expect(res.status).toBe(400);
  });
});
