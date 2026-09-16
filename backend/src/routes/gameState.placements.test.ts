import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryPlacements = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryPlacements as ReturnType<
    typeof vi.fn
  >,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const GUEST = { sub: "acct:guest", email: "guest@memphis.edu", exp: 9999999999 };

const MODEL_A = "11111111-1111-1111-1111-111111111111";
const MODEL_B = "22222222-2222-2222-2222-222222222222";

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

function modelRow(modelId: string) {
  return {
    model_id: modelId,
    session_id: null,
    label: `Model ${modelId.slice(0, 8)}`,
    storage_key: `models/${modelId}.glb`,
    height_mode: "brightness",
    width: 100,
    height: 100,
    vertex_count: 10,
    file_size: 1000,
    created_at: "2026-08-27T00:00:00.000Z",
  };
}

function installQueryRouter(opts: {
  session?: Record<string, unknown>;
  models?: Set<string>;
}) {
  const session = opts.session ?? sessionRow();
  const models = opts.models ?? new Set([MODEL_A, MODEL_B]);
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

    if (text.includes("FROM gltf_models WHERE model_id")) {
      const id = String(params?.[0] ?? "");
      if (!models.has(id)) return { rows: [] };
      return { rows: [modelRow(id)] };
    }

    if (text.includes("FROM gltf_models WHERE session_id")) {
      return { rows: [] };
    }

    if (text.includes("UPDATE gltf_models SET session_id")) {
      return { rowCount: 1, rows: [] };
    }

    return { rows: [] };
  });
}

describe("Game State - Model placements (#167)", () => {
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

  it("append seeds surround placement and selects new model", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ append: MODEL_B });

    expect(res.status).toBe(200);
    expect(res.body.playlist).toEqual([MODEL_A, MODEL_B]);
    expect(res.body.selectedModelId).toBe(MODEL_B);
    // Default stage layout is surround — two items sit on a radius-3 ring.
    expect(res.body.modelPlacements[MODEL_B].position[1]).toBe(0.5);
    expect(res.body.modelPlacements[MODEL_B].position[2]).toBeCloseTo(3, 5);
    expect(res.body.modelPlacements[MODEL_B].scale).toBe(1);
  });

  it("host can patch placement transform", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: {
          playlist: [MODEL_A, MODEL_B],
          modelPlacements: {
            [MODEL_A]: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: 1 },
            [MODEL_B]: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: 1 },
          },
        },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/model-placements")
      .send({
        selectedModelId: MODEL_B,
        placements: {
          [MODEL_B]: { position: [2, 0.5, 1], rotation: [0, 45, 0], scale: 2.5 },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.selectedModelId).toBe(MODEL_B);
    expect(res.body.modelPlacements[MODEL_B].position).toEqual([2, 0.5, 1]);
  });

  it("non-host gets 403 on model-placements", async () => {
    installQueryRouter({});
    currentUser = GUEST;

    const res = await request(app)
      .patch("/api/game-state/session-1/model-placements")
      .send({ selectedModelId: MODEL_A });

    expect(res.status).toBe(403);
  });
});
