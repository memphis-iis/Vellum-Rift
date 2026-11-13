import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const listAvailableDemos = vi.fn();

vi.mock("../lib/demoCatalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/demoCatalog.js")>();
  return {
    ...actual,
    listAvailableDemos: (...args: unknown[]) => listAvailableDemos(...args),
  };
});

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn().mockResolvedValue({ rows: [] });
  (globalThis as Record<string, unknown>).__pgMockQueryDemos = sharedQuery;
  return {
    ...actual,
    default: {
      Pool: class {
        query = sharedQuery;
      },
    },
  };
});

process.env.DEMO_ADMIN_EMAILS = "admin@memphis.edu";

import { BLUEKEY_CONFIG } from "../lib/auth.js";
import { isDemoAdmin } from "../lib/demoAdmins.js";
import { resetRateLimits } from "../lib/kioskRateLimit.js";
import demosRouter from "./demos.js";
import gameStateRouter from "./gameState.js";

const ADMIN = { sub: "acct:admin", email: "admin@memphis.edu", exp: 9999999999 };
const HOST = { sub: "acct:host", email: "host@memphis.edu", exp: 9999999999 };
const MODEL_A = "11111111-1111-1111-1111-111111111111";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    label: "Codex demo",
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
    metadata: {
      playlist: [MODEL_A],
      activeModelId: MODEL_A,
      kioskEnabled: true,
      exhibitReadonly: true,
      exhibitModelId: MODEL_A,
    },
    is_active: true,
    visibility: "public",
    created_by_sub: "acct:vellum-demos",
    created_by_email: "demos@vellum.rift",
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("Demos catalog", () => {
  let app: express.Express;
  let currentUser: typeof ADMIN | typeof HOST | null;
  const mocks = {
    query: (globalThis as Record<string, unknown>).__pgMockQueryDemos as ReturnType<
      typeof vi.fn
    >,
  };

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [] });
    listAvailableDemos.mockReset();
    resetRateLimits();
    currentUser = ADMIN;
    BLUEKEY_CONFIG.required = false;

    mocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        return { rows: [sessionRow()] };
      }
      if (text.includes("UPDATE game_sessions") || text.includes("INSERT INTO game_sessions")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (currentUser) req.user = { ...currentUser };
      next();
    });
    app.get("/api/demos/admin-status", (req, res) => {
      res.json({ isAdmin: isDemoAdmin(req.user?.email, { authRequired: true }) });
    });
    app.use("/api/demos", demosRouter);
    app.use("/api/game-state", gameStateRouter);
  });

  it("GET /api/demos lists available library exhibits", async () => {
    currentUser = null;
    listAvailableDemos.mockResolvedValue([
      {
        sessionId: "session-1",
        modelId: MODEL_A,
        label: "Codex demo",
        category: "Medieval",
        summary: "",
        updatedAt: "2026-08-27T00:00:00.000Z",
      },
    ]);
    const res = await request(app).get("/api/demos");
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(["Medieval"]);
    expect(res.body.demos).toHaveLength(1);
    expect(res.body.demos[0]).toMatchObject({
      sessionId: "session-1",
      modelId: MODEL_A,
      category: "Medieval",
      previewUrl: `/api/demos/${MODEL_A}/glb`,
    });
  });

  it("omits unavailable demos (empty catalog)", async () => {
    listAvailableDemos.mockResolvedValue([]);
    const res = await request(app).get("/api/demos");
    expect(res.status).toBe(200);
    expect(res.body.demos).toEqual([]);
  });

  it("admin-status reflects DEMO_ADMIN_EMAILS", async () => {
    currentUser = ADMIN;
    const adminRes = await request(app).get("/api/demos/admin-status");
    expect(adminRes.body.isAdmin).toBe(true);

    currentUser = HOST;
    const hostRes = await request(app).get("/api/demos/admin-status");
    expect(hostRes.body.isAdmin).toBe(false);
  });

  it("Space demo publish stays available to demo admins only", async () => {
    currentUser = HOST;
    const denied = await request(app)
      .patch("/api/game-state/session-1/demo")
      .send({ enabled: true, category: "Forgery" });
    expect(denied.status).toBe(403);
    currentUser = ADMIN;
    const res = await request(app)
      .patch("/api/game-state/session-1/demo")
      .send({ category: "Forgery" });
    expect(res.status).not.toBe(410);
    expect(res.status).not.toBe(403);
  });

  it("exhibitReadonly rejects guest playlist patch", async () => {
    currentUser = HOST;
    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [MODEL_A] });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
  });

  it("demo admin can patch exhibit playlist", async () => {
    currentUser = ADMIN;
    mocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        return { rows: [sessionRow()] };
      }
      if (text.includes("FROM gltf_models WHERE model_id")) {
        return {
          rows: [
            {
              model_id: MODEL_A,
              session_id: "session-1",
              label: "Codex",
              storage_key: "models/a.glb",
              height_mode: "fixed",
              width: 1,
              height: 1,
              vertex_count: 10,
              file_size: 100,
              created_at: "2026-08-27T00:00:00.000Z",
              owner_sub: null,
              folder_id: null,
              try_now_enabled: true,
              exhibit_session_id: "session-1",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .patch("/api/game-state/session-1/playlist")
      .send({ playlist: [MODEL_A] });
    expect(res.status).toBe(200);
  });
});
