import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryArtifacts = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryArtifacts as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

const ARTIFACT_ID = "artifact-1";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Test",
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
        position: { x: 1, y: 0, z: 0 },
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
    metadata: {
      artifacts: [
        {
          id: ARTIFACT_ID,
          artifactType: "waypoint",
          label: "Old",
          x: 1,
          y: 2,
          z: 3,
          createdBy: "player-host",
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        },
      ],
    },
    is_active: true,
    visibility: "public",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Game State — Artifacts (#163)", () => {
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

  it("POST stamps createdBy from authenticated player", async () => {
    const res = await request(app)
      .post("/api/game-state/session-1/artifacts")
      .send({ x: 0, y: 0, z: 0, label: "North gate", createdBy: "spoofed" });

    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe("player-host");
    expect(res.body.label).toBe("North gate");
  });

  it("PATCH allows creator to rename own pin", async () => {
    const res = await request(app)
      .patch(`/api/game-state/session-1/artifacts/${ARTIFACT_ID}`)
      .send({ label: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Renamed");
  });

  it("PATCH rejects non-creator guest", async () => {
    currentUser = GUEST;
    const res = await request(app)
      .patch(`/api/game-state/session-1/artifacts/${ARTIFACT_ID}`)
      .send({ label: "Hijack" });

    expect(res.status).toBe(403);
  });

  it("DELETE allows host to remove any pin", async () => {
    savedMetadata = sessionRow().metadata as Record<string, unknown>;
    currentUser = HOST;
    const res = await request(app).delete(
      `/api/game-state/session-1/artifacts/${ARTIFACT_ID}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE rejects non-creator guest", async () => {
    currentUser = GUEST;
    const res = await request(app).delete(
      `/api/game-state/session-1/artifacts/${ARTIFACT_ID}`,
    );

    expect(res.status).toBe(403);
  });
});
