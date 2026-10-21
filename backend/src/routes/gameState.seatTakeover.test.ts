import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQuerySeat = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQuerySeat as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

function playerRow(
  id: string,
  displayName: string,
  opts: {
    isHost?: boolean;
    sub?: string | null;
    email?: string | null;
    connectionId?: string | null;
  } = {},
) {
  return {
    id,
    displayName,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    isHost: Boolean(opts.isHost),
    isConnected: true,
    joinedAt: "2026-08-27T00:00:00.000Z",
    laserActive: false,
    laserOrigin: { x: 0, y: 0, z: 0 },
    laserDirection: { dx: 0, dy: 0, dz: 0 },
    bluekeySub: opts.sub ?? null,
    bluekeyEmail: opts.email ?? null,
    connectionId: opts.connectionId ?? "conn-initial",
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Seat takeover",
    host_id: "player-host",
    players: [
      playerRow("player-host", "Host", {
        isHost: true,
        sub: HOST.sub,
        email: HOST.email,
        connectionId: "conn-host",
      }),
      playerRow("player-guest", "Guest", {
        sub: GUEST.sub,
        email: GUEST.email,
        connectionId: "conn-guest-a",
      }),
    ],
    metadata: { kind: "event", kioskEnabled: true },
    is_active: true,
    visibility: "public",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Game State — seat takeover connectionId + kick", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST;
  let savedPlayers: unknown[] | null;
  let banInserts: unknown[];

  beforeEach(() => {
    mocks.query.mockReset();
    savedPlayers = null;
    banInserts = [];
    currentUser = GUEST;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM session_bans") && text.includes("SELECT 1")) {
        return { rows: [] };
      }
      if (text.includes("FROM session_bans") && text.includes("SELECT *")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO session_bans")) {
        banInserts.push(params);
        return {
          rowCount: 1,
          rows: [
            {
              id: "ban-1",
              session_id: params?.[0],
              subject_sub: params?.[1],
              email: params?.[2],
              player_id: params?.[3],
              display_name: params?.[4],
              reason: params?.[5],
              created_by_sub: params?.[6],
              created_by_email: params?.[7],
              created_at: "2026-08-27T00:00:00.000Z",
            },
          ],
        };
      }
      if (text.includes("INSERT INTO session_moderation_events")) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("FROM game_sessions WHERE session_id")) {
        const base = sessionRow();
        return {
          rows: [
            {
              ...base,
              players: savedPlayers ?? base.players,
            },
          ],
        };
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

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use("/api/game-state", gameStateRouter);
  });

  it("rejoin same Bluekey identity keeps playerId and mints new connectionId", async () => {
    const first = await request(app)
      .post("/api/game-state/session-1/players")
      .send({ displayName: "Guest" });
    expect(first.status).toBe(200);
    expect(first.body.id).toBe("player-guest");
    expect(first.body.connectionId).toBeTruthy();
    expect(first.body.connectionId).not.toBe("conn-guest-a");

    const connAfterFirst = first.body.connectionId as string;

    const second = await request(app)
      .post("/api/game-state/session-1/players")
      .send({ displayName: "Guest" });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe("player-guest");
    expect(second.body.connectionId).toBeTruthy();
    expect(second.body.connectionId).not.toBe(connAfterFirst);

    const roster = (savedPlayers ?? []) as Array<{ id: string }>;
    expect(roster.filter((p) => p.id === "player-guest")).toHaveLength(1);
  });

  it("explicit playerId reclaim mints a new connectionId", async () => {
    const res = await request(app)
      .post("/api/game-state/session-1/players")
      .send({ displayName: "Guest", playerId: "player-guest" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("player-guest");
    expect(res.body.connectionId).not.toBe("conn-guest-a");
  });

  it("matching connectionId resumes the seat without takeover", async () => {
    const res = await request(app)
      .post("/api/game-state/session-1/players")
      .send({
        displayName: "Guest",
        playerId: "player-guest",
        connectionId: "conn-guest-a",
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("player-guest");
    expect(res.body.connectionId).toBe("conn-guest-a");
  });

  it("new join without identity creates a fresh connectionId", async () => {
    currentUser = { sub: "acct:new", email: "new@memphis.edu", exp: 9999999999 };
    const res = await request(app)
      .post("/api/game-state/session-1/players")
      .send({ displayName: "Newcomer" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.id).not.toBe("player-guest");
    expect(res.body.connectionId).toBeTruthy();
  });

  it("kick removes the player and records a ban for Bluekey identity", async () => {
    currentUser = HOST;
    const res = await request(app)
      .post("/api/game-state/session-1/players/player-guest/kick")
      .send({ reason: "disruptive" });
    expect(res.status).toBe(200);
    expect(res.body.kicked).toBe(true);
    expect(res.body.banned).toBe(true);
    expect(banInserts.length).toBeGreaterThanOrEqual(1);

    const roster = (savedPlayers ?? []) as Array<{ id: string }>;
    expect(roster.find((p) => p.id === "player-guest")).toBeUndefined();
  });
});
