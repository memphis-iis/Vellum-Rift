import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
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

const mocks = {
  query: (globalThis as Record<string, unknown>).__pgMockQueryDemos as ReturnType<
    typeof vi.fn
  >,
};

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
      demoEnabled: true,
      demoCategory: "Medieval",
      demoSummary: "Study a folio",
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

describe("Demos catalog", () => {
  let app: express.Express;
  let currentUser: typeof ADMIN | typeof HOST | null;
  let savedMetadata: Record<string, unknown> | null;
  let listRows: Record<string, unknown>[] | null;

  beforeEach(() => {
    mocks.query.mockReset();
    resetRateLimits();
    savedMetadata = null;
    listRows = null;
    currentUser = ADMIN;
    BLUEKEY_CONFIG.required = false;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        const base = sessionRow();
        const meta = savedMetadata ?? (base.metadata as Record<string, unknown>);
        return { rows: [{ ...base, metadata: meta }] };
      }
      if (text.includes("FROM game_sessions ORDER BY updated_at")) {
        const rows = listRows ?? [
          {
            ...sessionRow(),
            metadata:
              savedMetadata ??
              (sessionRow().metadata as Record<string, unknown>),
          },
        ];
        return { rows };
      }
      if (text.includes("INSERT INTO game_sessions") || text.includes("UPDATE game_sessions")) {
        const metadataParam = params?.[3];
        if (typeof metadataParam === "string") {
          savedMetadata = JSON.parse(metadataParam) as Record<string, unknown>;
        } else if (metadataParam && typeof metadataParam === "object") {
          savedMetadata = metadataParam as Record<string, unknown>;
        }
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
    // Injected-user harness (same pattern as kiosk tests) — avoid live introspect.
    app.get("/api/demos/admin-status", (req, res) => {
      res.json({ isAdmin: isDemoAdmin(req.user?.email, { authRequired: true }) });
    });
    app.use("/api/demos", demosRouter);
    app.use("/api/game-state", gameStateRouter);
  });

  it("GET /api/demos lists curated demos publicly", async () => {
    currentUser = null;
    const res = await request(app).get("/api/demos");
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(["Medieval"]);
    expect(res.body.demos).toHaveLength(1);
    expect(res.body.demos[0]).toMatchObject({
      sessionId: "session-1",
      category: "Medieval",
      playlistCount: 1,
    });
  });

  it("omits demos without demoEnabled", async () => {
    listRows = [
      sessionRow({
        metadata: {
          playlist: [MODEL_A],
          kioskEnabled: true,
        },
      }),
    ];
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

  it("demo admin can publish a Space as demo", async () => {
    savedMetadata = { playlist: [MODEL_A], activeModelId: MODEL_A };
    currentUser = ADMIN;
    const res = await request(app)
      .patch("/api/game-state/session-1/demo")
      .send({ enabled: true, category: "Forgery", summary: "Spot the fake" });
    expect(res.status).toBe(200);
    expect(res.body.demoEnabled).toBe(true);
    expect(res.body.demoCategory).toBe("Forgery");
    expect(res.body.kioskEnabled).toBe(true);
  });

  it("non-admin cannot publish demos", async () => {
    currentUser = HOST;
    const res = await request(app)
      .patch("/api/game-state/session-1/demo")
      .send({ enabled: true, category: "Forgery" });
    expect(res.status).toBe(403);
  });
});
