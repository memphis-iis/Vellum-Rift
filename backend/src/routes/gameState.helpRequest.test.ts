import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryHelp = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryHelp as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "LAN night",
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
      {
        id: "player-guest",
        displayName: "Guest",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        isHost: false,
        isConnected: true,
        joinedAt: "2026-08-27T00:00:00.000Z",
        laserActive: false,
        laserOrigin: { x: 0, y: 0, z: 0 },
        laserDirection: { dx: 0, dy: 0, dz: 0 },
        bluekeySub: GUEST.sub,
        bluekeyEmail: GUEST.email,
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

describe("Game State — help requests (#294)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST;
  let savedMetadata: Record<string, unknown> | null;

  beforeEach(() => {
    mocks.query.mockReset();
    savedMetadata = null;
    currentUser = GUEST;

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
      return { rows: [] };
    });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use("/api/game-state", gameStateRouter);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("guest can POST help-request and GET session exposes pending list", async () => {
    const create = await request(app)
      .post("/api/game-state/session-1/help-request")
      .send({ playerId: "player-guest" });
    expect(create.status).toBe(201);
    expect(create.body.helpRequest.playerName).toBe("Guest");

    const snap = await request(app).get("/api/game-state/session-1");
    expect(snap.status).toBe(200);
    expect(snap.body.helpRequests).toHaveLength(1);
    expect(snap.body.helpRequests[0].id).toBe(create.body.helpRequest.id);
  });

  it("rate-limits repeat help requests from the same player", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));

    const first = await request(app)
      .post("/api/game-state/session-1/help-request")
      .send({ playerId: "player-guest" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/game-state/session-1/help-request")
      .send({ playerId: "player-guest" });
    expect(second.status).toBe(429);
    expect(second.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("host can ack; guest cannot", async () => {
    const create = await request(app)
      .post("/api/game-state/session-1/help-request")
      .send({ playerId: "player-guest" });
    const id = create.body.helpRequest.id as string;

    currentUser = GUEST;
    const denied = await request(app)
      .post(`/api/game-state/session-1/help-requests/${id}/ack`)
      .send({});
    expect(denied.status).toBe(403);

    currentUser = HOST;
    const ack = await request(app)
      .post(`/api/game-state/session-1/help-requests/${id}/ack`)
      .send({});
    expect(ack.status).toBe(200);
    expect(ack.body.helpRequests).toHaveLength(0);

    const snap = await request(app).get("/api/game-state/session-1");
    expect(snap.body.helpRequests).toHaveLength(0);
  });

  it("rejects help-request for a player id that is not the caller", async () => {
    const res = await request(app)
      .post("/api/game-state/session-1/help-request")
      .send({ playerId: "player-host" });
    expect(res.status).toBe(403);
  });
});
