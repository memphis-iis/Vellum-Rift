import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryFlashlight = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryFlashlight as ReturnType<
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
        flashlightOn: false,
        flashlightOrigin: { x: 0, y: 0, z: 0 },
        flashlightDirection: { dx: 0, dy: -0.2, dz: 1 },
        bluekeySub: HOST.sub,
        bluekeyEmail: HOST.email,
      },
      {
        id: "player-guest",
        displayName: "Guest",
        position: { x: 1, y: 0, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        isHost: false,
        isConnected: true,
        joinedAt: "2026-08-27T00:00:00.000Z",
        laserActive: false,
        laserOrigin: { x: 0, y: 0, z: 0 },
        laserDirection: { dx: 0, dy: 0, dz: 0 },
        flashlightOn: false,
        flashlightOrigin: { x: 0, y: 0, z: 0 },
        flashlightDirection: { dx: 0, dy: -0.2, dz: 1 },
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

function installQueryRouter(session = sessionRow()) {
  let savedPlayers = session.players as unknown[];
  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (text.includes("FROM game_sessions WHERE session_id")) {
      return { rows: [{ ...session, players: savedPlayers }] };
    }
    if (text.includes("UPDATE game_sessions")) {
      const playersParam = params?.[2];
      if (typeof playersParam === "string") {
        savedPlayers = JSON.parse(playersParam) as unknown[];
      } else if (Array.isArray(playersParam)) {
        savedPlayers = playersParam;
      }
      return { rowCount: 1, rows: [] };
    }
    return { rows: [] };
  });
}

describe("Game State - Shared flashlight (#244)", () => {
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

  it("guest can toggle own flashlight on and list sees it", async () => {
    installQueryRouter();
    currentUser = GUEST;

    const patch = await request(app)
      .patch("/api/game-state/session-1/flashlight")
      .send({
        playerId: "player-guest",
        on: true,
        origin: { x: 1, y: 1.6, z: 2 },
        direction: { dx: 0, dy: -0.1, dz: 1 },
      });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);

    const list = await request(app).get("/api/game-state/session-1/flashlights");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((e: { playerId: string }) => e.playerId === "player-guest")).toBe(
      true,
    );
  });

  it("cannot spoof another player's flashlight", async () => {
    installQueryRouter();
    currentUser = GUEST;

    const res = await request(app)
      .patch("/api/game-state/session-1/flashlight")
      .send({ playerId: "player-host", on: true });
    expect(res.status).toBe(403);
  });
});
