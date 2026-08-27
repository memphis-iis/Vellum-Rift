import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryKiosk = sharedQuery;
  return {
    ...actual,
    default: {
      Pool: class {
        query = sharedQuery;
      },
    },
  };
});

const mocks = {
  query: (globalThis as Record<string, unknown>).__pgMockQueryKiosk as ReturnType<
    typeof vi.fn
  >,
};

process.env.KIOSK_JWT_SECRET = "test-kiosk-secret-145";
process.env.KIOSK_RATE_LIMIT = "100";

import { BLUEKEY_CONFIG, requireAuthOrKiosk } from "../lib/auth.js";
import { resetRateLimits } from "../lib/kioskRateLimit.js";
import { verifyKioskToken } from "../lib/kioskJwt.js";
import gameStateRouter from "./gameState.js";
import kioskRouter from "./kiosk.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const MODEL_A = "11111111-1111-1111-1111-111111111111";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Museum room",
    host_id: "player-host",
    players: [
      {
        id: "player-host",
        displayName: "Host",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        isHost: true,
        isConnected: true,
        joinedAt: "2026-08-27T00:00:00.000Z",
        laserActive: false,
        laserOrigin: { x: 0, y: 0, z: 0 },
        laserDirection: { dx: 0, dy: 0, dz: 0 },
        bluekeySub: HOST.sub,
        bluekeyEmail: HOST.email,
      },
    ],
    metadata: { playlist: [MODEL_A], activeModelId: MODEL_A, kioskEnabled: true },
    is_active: true,
    visibility: "private",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Kiosk public join (#145)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | null;
  let savedMetadata: Record<string, unknown> | null;

  beforeEach(() => {
    mocks.query.mockReset();
    resetRateLimits();
    savedMetadata = null;
    currentUser = HOST;
    BLUEKEY_CONFIG.required = true;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        const base = sessionRow();
        const meta = savedMetadata ?? (base.metadata as Record<string, unknown>);
        return { rows: [{ ...base, metadata: meta }] };
      }
      if (text.includes("UPDATE game_sessions")) {
        const metadataParam = params?.[3];
        if (typeof metadataParam === "string") {
          savedMetadata = JSON.parse(metadataParam) as Record<string, unknown>;
        } else if (metadataParam && typeof metadataParam === "object") {
          savedMetadata = metadataParam as Record<string, unknown>;
        }
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("FROM session_bans")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    app = express();
    app.use(express.json());
    app.use("/api/kiosk", kioskRouter);
    app.use((req, _res, next) => {
      if (currentUser) req.user = currentUser;
      next();
    });
    app.use("/api/game-state", gameStateRouter);
  });

  afterEach(() => {
    BLUEKEY_CONFIG.required = false;
  });

  it("status returns 403 when kiosk is off", async () => {
    savedMetadata = { playlist: [MODEL_A] };
    const res = await request(app).get("/api/kiosk/session-1/status");
    expect(res.status).toBe(403);
    expect(res.body.kioskEnabled).toBe(false);
  });

  it("mints a token when kiosk is enabled", async () => {
    const res = await request(app).post("/api/kiosk/session-1/token");
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.sessionId).toBe("session-1");
    expect(verifyKioskToken(res.body.accessToken)?.sessionId).toBe("session-1");
  });

  it("host can toggle kioskEnabled", async () => {
    const res = await request(app)
      .patch("/api/game-state/session-1/kiosk")
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.kioskEnabled).toBe(false);
    expect(savedMetadata?.kioskEnabled).toBeUndefined();
  });

  it("guest with kiosk token can read private kiosk session and join as Guest", async () => {
    const tokenRes = await request(app).post("/api/kiosk/session-1/token");
    const token = tokenRes.body.accessToken as string;

    const kioskApp = express();
    kioskApp.use(express.json());
    kioskApp.use("/api/kiosk", kioskRouter);
    kioskApp.use("/api/game-state", requireAuthOrKiosk, gameStateRouter);

    const getRes = await request(kioskApp)
      .get("/api/game-state/session-1")
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.kioskEnabled).toBe(true);

    const joinRes = await request(kioskApp)
      .post("/api/game-state/session-1/players")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Visitor", isHost: true });
    expect(joinRes.status).toBe(201);
    expect(joinRes.body.isHost).toBe(false);
    expect(joinRes.body.displayName).toBe("Visitor");
    expect(joinRes.body.bluekeySub).toMatch(/^kiosk:/);
  });

  it("kiosk guest cannot patch playlist", async () => {
    const tokenRes = await request(app).post("/api/kiosk/session-1/token");
    const token = tokenRes.body.accessToken as string;

    const kioskApp = express();
    kioskApp.use(express.json());
    kioskApp.use("/api/game-state", requireAuthOrKiosk, gameStateRouter);

    const res = await request(kioskApp)
      .patch("/api/game-state/session-1/playlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ append: MODEL_A });
    expect(res.status).toBe(403);
  });

  it("non-kiosk session still requires auth for game-state", async () => {
    savedMetadata = { playlist: [MODEL_A] }; // kiosk off
    const kioskApp = express();
    kioskApp.use(express.json());
    kioskApp.use("/api/game-state", requireAuthOrKiosk, gameStateRouter);

    const res = await request(kioskApp).get("/api/game-state/session-1");
    expect(res.status).toBe(401);
  });
});
