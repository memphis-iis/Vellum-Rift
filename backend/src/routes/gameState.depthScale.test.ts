import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryDepth = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryDepth as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

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
    metadata: {},
    is_active: true,
    visibility: "public",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function installQueryRouter(session = sessionRow()) {
  let savedMetadata: Record<string, unknown> | null = null;

  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const text = String(sql);

    if (text.includes("FROM game_sessions WHERE session_id")) {
      const meta = savedMetadata ?? (session.metadata as Record<string, unknown>);
      return { rows: [{ ...session, metadata: meta }] };
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

    return { rows: [] };
  });
}

describe("Game State — depthScale (#328)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST | null;

  beforeEach(() => {
    mocks.query.mockReset();
    currentUser = HOST;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (currentUser) req.user = currentUser;
      next();
    });
    app.use("/api/game-state", gameStateRouter);
  });

  it("GET session returns depthScale default 1", async () => {
    installQueryRouter();
    const res = await request(app).get("/api/game-state/session-1");
    expect(res.status).toBe(200);
    expect(res.body.depthScale).toBe(1);
  });

  it("host can PATCH depthScale", async () => {
    installQueryRouter();
    const res = await request(app)
      .patch("/api/game-state/session-1/depth-scale")
      .send({ depthScale: 2.5 });
    expect(res.status).toBe(200);
    expect(res.body.depthScale).toBe(2.5);
    expect(res.body.metadata.depthScale).toBe(2.5);
  });

  it("clamps out-of-range values", async () => {
    installQueryRouter();
    const high = await request(app)
      .patch("/api/game-state/session-1/depth-scale")
      .send({ depthScale: 99 });
    expect(high.status).toBe(200);
    expect(high.body.depthScale).toBe(5);

    const low = await request(app)
      .patch("/api/game-state/session-1/depth-scale")
      .send({ depthScale: -2 });
    expect(low.status).toBe(200);
    expect(low.body.depthScale).toBe(0);
  });

  it("rejects non-numeric depthScale", async () => {
    installQueryRouter();
    const res = await request(app)
      .patch("/api/game-state/session-1/depth-scale")
      .send({ depthScale: "tall" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/depthScale/i);
  });

  it("non-host gets 403", async () => {
    installQueryRouter();
    currentUser = GUEST;
    const res = await request(app)
      .patch("/api/game-state/session-1/depth-scale")
      .send({ depthScale: 2 });
    expect(res.status).toBe(403);
  });
});
