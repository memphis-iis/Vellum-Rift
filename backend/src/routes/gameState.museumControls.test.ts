import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryMuseum = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryMuseum as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };
const KIOSK = {
  sub: "kiosk:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "",
  exp: 9999999999,
  kioskSessionId: "session-1",
};

function playerRow(
  id: string,
  displayName: string,
  opts: {
    isHost?: boolean;
    sub?: string | null;
    email?: string | null;
  } = {},
) {
  return {
    id,
    displayName,
    position: { x: 1, y: 0, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
    isHost: Boolean(opts.isHost),
    isConnected: true,
    joinedAt: "2026-08-27T00:00:00.000Z",
    laserActive: false,
    laserOrigin: { x: 0, y: 0, z: 0 },
    laserDirection: { dx: 0, dy: 0, dz: 0 },
    bluekeySub: opts.sub ?? null,
    bluekeyEmail: opts.email ?? null,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Museum night",
    host_id: "player-host",
    players: [
      playerRow("player-host", "Host", {
        isHost: true,
        sub: HOST.sub,
        email: HOST.email,
      }),
      playerRow("player-guest", "Guest", {
        sub: GUEST.sub,
        email: GUEST.email,
      }),
      playerRow("player-kiosk", "Tablet Guest", {
        sub: KIOSK.sub,
        email: "",
      }),
    ],
    metadata: { kind: "event", kioskEnabled: true, playlist: ["model-a"] },
    is_active: true,
    visibility: "public",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Game State — museum respawn + control schemes (#322)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST | typeof KIOSK;
  let savedPlayers: unknown[] | null;
  let savedMetadata: Record<string, unknown> | null;

  beforeEach(() => {
    mocks.query.mockReset();
    savedPlayers = null;
    savedMetadata = null;
    currentUser = HOST;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        const base = sessionRow();
        return {
          rows: [
            {
              ...base,
              players: savedPlayers ?? base.players,
              metadata: savedMetadata ?? (base.metadata as Record<string, unknown>),
            },
          ],
        };
      }
      if (text.includes("UPDATE game_sessions")) {
        const playersParam = params?.[2];
        const metadataParam = params?.[3];
        if (typeof playersParam === "string") {
          savedPlayers = JSON.parse(playersParam) as unknown[];
        } else if (Array.isArray(playersParam)) {
          savedPlayers = playersParam;
        }
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

  it("rejects respawn on exploration spaces", async () => {
    savedMetadata = { kind: "exploration", kioskEnabled: true };
    const res = await request(app)
      .post("/api/game-state/session-1/players/player-guest/respawn")
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects respawn when kiosk is off", async () => {
    savedMetadata = { kind: "event" };
    const res = await request(app)
      .post("/api/game-state/session-1/players/player-guest/respawn")
      .send({});
    expect(res.status).toBe(403);
  });

  it("host can respawn a kiosk guest facing origin", async () => {
    const res = await request(app)
      .post("/api/game-state/session-1/players/player-kiosk/respawn")
      .send({});
    expect(res.status).toBe(200);
    const player = res.body.player;
    expect(player.pendingRespawn).toBeTruthy();
    expect(player.pendingRespawn.seq).toBe(1);
    const { x, z, yaw } = player.pendingRespawn as {
      x: number;
      z: number;
      yaw: number;
    };
    const yawRad = (yaw * Math.PI) / 180;
    const fx = Math.sin(yawRad);
    const fz = Math.cos(yawRad);
    const len = Math.hypot(-x, -z);
    const dot = (fx * -x + fz * -z) / len;
    expect(dot).toBeGreaterThan(0.99);
  });

  it("kiosk JWT can respawn self but not another player", async () => {
    currentUser = KIOSK;
    const self = await request(app)
      .post("/api/game-state/session-1/players/player-kiosk/respawn")
      .send({});
    expect(self.status).toBe(200);

    const other = await request(app)
      .post("/api/game-state/session-1/players/player-guest/respawn")
      .send({});
    expect(other.status).toBe(403);
  });

  it("host can set Quest control scheme; invalid scheme 400", async () => {
    const bad = await request(app)
      .patch("/api/game-state/session-1/players/player-guest/control-scheme")
      .send({ scheme: "laptop" });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .patch("/api/game-state/session-1/players/player-guest/control-scheme")
      .send({ scheme: "splitLaserJetpack" });
    expect(ok.status).toBe(200);
    expect(ok.body.player.controlScheme).toBe("splitLaserJetpack");
  });

  it("kiosk JWT can set own scheme only", async () => {
    currentUser = KIOSK;
    const self = await request(app)
      .patch("/api/game-state/session-1/players/player-kiosk/control-scheme")
      .send({ scheme: "default" });
    expect(self.status).toBe(200);

    const other = await request(app)
      .patch("/api/game-state/session-1/players/player-guest/control-scheme")
      .send({ scheme: "splitLaserJetpack" });
    expect(other.status).toBe(403);
  });

  it("respawn-all is host-only on museum path", async () => {
    currentUser = KIOSK;
    const denied = await request(app).post("/api/game-state/session-1/respawn-all").send({});
    expect(denied.status).toBe(403);

    currentUser = HOST;
    const ok = await request(app).post("/api/game-state/session-1/respawn-all").send({});
    expect(ok.status).toBe(200);
    expect(ok.body.count).toBeGreaterThanOrEqual(3);
  });
});
