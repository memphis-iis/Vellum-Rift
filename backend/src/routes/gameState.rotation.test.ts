import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryRotation = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryRotation as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Museum night",
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

describe("Game State — Host rotation timer", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST;
  let savedMetadata: Record<string, unknown> | null;
  let initialMetadata: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T17:00:00.000Z"));

    mocks.query.mockReset();
    savedMetadata = null;
    initialMetadata = {};
    currentUser = HOST;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        const base = sessionRow();
        const meta = savedMetadata ?? initialMetadata;
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

  it("GET defaults to playing with no timer", async () => {
    const res = await request(app).get("/api/game-state/session-1");
    expect(res.status).toBe(200);
    expect(res.body.experiencePhase).toBe("playing");
    expect(res.body.rotationEndsAt).toBeNull();
  });

  it("host starts a turn with server-clock end time", async () => {
    const res = await request(app)
      .patch("/api/game-state/session-1/turn")
      .send({ rotationMinutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.experiencePhase).toBe("playing");
    expect(res.body.rotationEndsAt).toBe("2026-09-15T17:10:00.000Z");
    expect(savedMetadata?.experiencePhase).toBe("playing");
    expect(savedMetadata?.rotationEndsAt).toBe("2026-09-15T17:10:00.000Z");
  });

  it("host reset forces ended", async () => {
    initialMetadata = {
      experiencePhase: "playing",
      rotationEndsAt: "2026-09-15T17:10:00.000Z",
    };
    const res = await request(app)
      .patch("/api/game-state/session-1/turn")
      .send({ experiencePhase: "ended" });
    expect(res.status).toBe(200);
    expect(res.body.experiencePhase).toBe("ended");
    expect(res.body.rotationEndsAt).toBeNull();
    expect(savedMetadata?.experiencePhase).toBe("ended");
  });

  it("GET clamps an expired playing turn to ended", async () => {
    initialMetadata = {
      experiencePhase: "playing",
      rotationEndsAt: "2026-09-15T16:59:00.000Z",
    };
    const res = await request(app).get("/api/game-state/session-1");
    expect(res.status).toBe(200);
    expect(res.body.experiencePhase).toBe("ended");
    expect(res.body.rotationEndsAt).toBe("2026-09-15T16:59:00.000Z");
  });

  it("rejects invalid rotation minutes", async () => {
    const res = await request(app)
      .patch("/api/game-state/session-1/turn")
      .send({ rotationMinutes: 7 });
    expect(res.status).toBe(400);
    expect(savedMetadata).toBeNull();
  });

  it("guest cannot patch rotation", async () => {
    currentUser = GUEST;
    const res = await request(app)
      .patch("/api/game-state/session-1/turn")
      .send({ rotationMinutes: 5 });
    expect(res.status).toBe(403);
    expect(savedMetadata).toBeNull();
  });
});
