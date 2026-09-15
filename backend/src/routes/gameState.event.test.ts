import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryEvent = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryEvent as ReturnType<
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

describe("Game State — Event chrome (#146)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST;
  let savedMetadata: Record<string, unknown> | null;

  beforeEach(() => {
    mocks.query.mockReset();
    savedMetadata = null;
    currentUser = HOST;

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

  it("GET returns kind exploration by default", async () => {
    const res = await request(app).get("/api/game-state/session-1");
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("exploration");
    expect(res.body.startsAt).toBeNull();
    expect(res.body.endsAt).toBeNull();
  });

  it("host can mark session as event with schedule", async () => {
    const res = await request(app)
      .patch("/api/game-state/session-1/event")
      .send({
        kind: "event",
        startsAt: "2026-09-15T17:00:00.000Z",
        endsAt: "2026-09-15T21:00:00.000Z",
      });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("event");
    expect(res.body.startsAt).toBe("2026-09-15T17:00:00.000Z");
    expect(res.body.endsAt).toBe("2026-09-15T21:00:00.000Z");
    expect(savedMetadata?.kind).toBe("event");
  });

  it("guest cannot patch event chrome", async () => {
    currentUser = GUEST;
    const res = await request(app)
      .patch("/api/game-state/session-1/event")
      .send({ kind: "event" });
    expect(res.status).toBe(403);
  });
});
