import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryPlaylist = sharedQuery;
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
  query: (globalThis as Record<string, unknown>).__pgMockQueryPlaylist as ReturnType<
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

/**
 * Route SQL through a small dispatcher keyed on query text.
 * Order-independent enough for playlist/active-model flows.
 */
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
      // params: label, host_id, players, metadata, ...
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

describe("Game State — Playlist / active model (#141)", () => {
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

  it("GET session returns playlist + activeModelId top-level", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app).get("/api/game-state/session-1");
    expect(res.status).toBe(200);
    expect(res.body.playlist).toEqual([MODEL_A]);
    expect(res.body.activeModelId).toBe(MODEL_A);
    expect(res.body.metadata.playlist).toEqual([MODEL_A]);
  });

  it("host can replace playlist", async () => {
    installQueryRouter({});

    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [MODEL_A, MODEL_B] });

    expect(res.status).toBe(200);
    expect(res.body.playlist).toEqual([MODEL_A, MODEL_B]);
    expect(res.body.activeModelId).toBe(MODEL_A);
  });

  it("host can append and set active", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ append: MODEL_B, activeModelId: MODEL_B });

    expect(res.status).toBe(200);
    expect(res.body.playlist).toEqual([MODEL_A, MODEL_B]);
    expect(res.body.activeModelId).toBe(MODEL_B);
  });

  it("host can switch active model", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A, MODEL_B], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/active-model")
      .send({ modelId: MODEL_B });

    expect(res.status).toBe(200);
    expect(res.body.activeModelId).toBe(MODEL_B);
  });

  it("rejects active model not in playlist", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/active-model")
      .send({ modelId: MODEL_B });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/playlist/i);
  });

  it("rejects unknown modelId on playlist replace", async () => {
    installQueryRouter({ models: new Set([MODEL_A]) });

    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [MODEL_A, MODEL_B] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown modelId/);
  });

  it("non-host gets 403 on playlist and active-model", async () => {
    installQueryRouter({});
    currentUser = GUEST;

    const playlistRes = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [MODEL_A] });
    expect(playlistRes.status).toBe(403);

    const activeRes = await request(app)
      .patch("/api/game-state/session-1/active-model")
      .send({ modelId: MODEL_A });
    expect(activeRes.status).toBe(403);
  });

  it("empty playlist clears activeModelId", async () => {
    installQueryRouter({
      session: sessionRow({
        metadata: { playlist: [MODEL_A], activeModelId: MODEL_A },
      }),
    });

    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [] });

    expect(res.status).toBe(200);
    expect(res.body.playlist).toEqual([]);
    expect(res.body.activeModelId).toBeNull();
  });
});
