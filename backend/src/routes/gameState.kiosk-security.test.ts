import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { PlayerState } from "../components/gameState.js";

vi.mock("pg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const sharedQuery = vi.fn();
  (globalThis as Record<string, unknown>).__pgMockQueryKioskSec = sharedQuery;
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
  query: (globalThis as Record<string, unknown>)
    .__pgMockQueryKioskSec as ReturnType<typeof vi.fn>,
};

import gameStateRouter from "./gameState.js";

const HOST = { sub: "acct:host", email: "lcwells@memphis.edu", exp: 9999999999 };
const GUEST = {
  sub: "kiosk:guest-aaa",
  email: "",
  exp: 9999999999,
  kioskSessionId: "session-1",
};

function playerRow(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "player-host",
    displayName: "lcwells",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    isHost: true,
    isConnected: true,
    joinedAt: "2026-08-27T00:00:00.000Z",
    laserActive: false,
    laserOrigin: { x: 0, y: 0, z: 0 },
    laserDirection: { dx: 0, dy: 0, dz: 0 },
    flashlightOn: false,
    bluekeySub: HOST.sub,
    bluekeyEmail: HOST.email,
    chatMuted: false,
    ...overrides,
  };
}

function guestRow(): PlayerState {
  return playerRow({
    id: "player-guest",
    displayName: "Visitor",
    isHost: false,
    bluekeySub: GUEST.sub,
    bluekeyEmail: null,
  });
}

function sessionRow(players: PlayerState[]) {
  return {
    session_id: "session-1",
    label: "Museum",
    host_id: "player-host",
    players,
    metadata: {
      kioskEnabled: true,
      hostEmail: HOST.email,
      messages: [],
    },
    is_active: true,
    visibility: "private",
    created_by_sub: HOST.sub,
    created_by_email: HOST.email,
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
  };
}

describe("Kiosk guest security (#259 #251 #255)", () => {
  let app: express.Express;
  let currentUser: typeof HOST | typeof GUEST;
  let players: PlayerState[];

  beforeEach(() => {
    mocks.query.mockReset();
    players = [playerRow(), guestRow()];
    currentUser = GUEST;

    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes("FROM game_sessions WHERE session_id")) {
        return { rows: [sessionRow(players)] };
      }
      if (text.includes("UPDATE game_sessions")) {
        const playersJson = params?.[2];
        if (typeof playersJson === "string") {
          players = JSON.parse(playersJson) as PlayerState[];
        }
        const metaJson = params?.[3];
        if (typeof metaJson === "string") {
          // keep players; metadata updates happen in-memory via save path
        }
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("session_bans") || text.includes("is_banned")) {
        return { rows: [] };
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

  describe("#259 player ownership", () => {
    it("rejects position updates that target the host", async () => {
      const res = await request(app)
        .patch("/api/game-state/session-1/position")
        .send({ playerId: "player-host", position: { x: 77, y: 0, z: 77 } });
      expect(res.status).toBe(403);
      expect(players.find((p) => p.id === "player-host")!.position).toEqual({
        x: 0,
        y: 0,
        z: 0,
      });
    });

    it("allows position updates for the guest's own player", async () => {
      const res = await request(app)
        .patch("/api/game-state/session-1/position")
        .send({ playerId: "player-guest", position: { x: 1, y: 2, z: 3 } });
      expect(res.status).toBe(200);
      expect(players.find((p) => p.id === "player-guest")!.position).toEqual({
        x: 1,
        y: 2,
        z: 3,
      });
    });

    it("rejects laser / flashlight / rotation / chat spoofing as host", async () => {
      const laser = await request(app)
        .patch("/api/game-state/session-1/laser")
        .send({
          playerId: "player-host",
          active: true,
          origin: { x: 0, y: 1, z: 0 },
          direction: { dx: 0, dy: 0, dz: 1 },
        });
      expect(laser.status).toBe(403);

      const light = await request(app)
        .patch("/api/game-state/session-1/flashlight")
        .send({ playerId: "player-host", on: true });
      expect(light.status).toBe(403);

      const rot = await request(app)
        .patch("/api/game-state/session-1/rotation")
        .send({ playerId: "player-host", rotation: { x: 0, y: 90, z: 0 } });
      expect(rot.status).toBe(403);

      const chat = await request(app)
        .post("/api/game-state/session-1/chat")
        .send({ playerId: "player-host", text: "spoofed as host" });
      expect(chat.status).toBe(403);
    });
  });

  describe("#251 PII redaction", () => {
    it("strips host email and creator identity from GET game-state", async () => {
      const res = await request(app).get("/api/game-state/session-1");
      expect(res.status).toBe(200);
      expect(res.body.createdByEmail).toBe("");
      expect(res.body.createdBySub).toBe("");
      expect(res.body.metadata.hostEmail).toBeUndefined();
      for (const p of res.body.players as PlayerState[]) {
        expect(p.bluekeyEmail).toBeNull();
        expect(p.bluekeySub).toBeNull();
      }
    });

    it("still returns host email to the Bluekey host", async () => {
      currentUser = HOST;
      const res = await request(app).get("/api/game-state/session-1");
      expect(res.status).toBe(200);
      expect(res.body.createdByEmail).toBe(HOST.email);
      expect(res.body.createdBySub).toBe(HOST.sub);
      expect(res.body.metadata.hostEmail).toBe(HOST.email);
    });
  });

  describe("#255 displayName sanitization", () => {
    it("strips HTML/script characters from kiosk nametags", async () => {
      players = [playerRow()];
      const res = await request(app)
        .post("/api/game-state/session-1/players")
        .send({ displayName: '<script>x</script>Alert("hi")', isHost: false });
      expect(res.status).toBe(201);
      expect(res.body.displayName).not.toMatch(/[<>&"'`\\/]/);
      expect(res.body.displayName).toBe("xAlert(hi)");
    });
  });

  describe("#262 chat rate limit", () => {
    it("returns 429 after too many chat posts from one player", async () => {
      process.env.CHAT_RATE_LIMIT = "3";
      process.env.CHAT_RATE_WINDOW_MS = "60000";
      const { resetRateLimits } = await import("../lib/kioskRateLimit.js");
      resetRateLimits();

      for (let i = 0; i < 3; i++) {
        const ok = await request(app)
          .post("/api/game-state/session-1/chat")
          .send({ playerId: "player-guest", text: `msg ${i}` });
        expect(ok.status).toBe(201);
      }
      const blocked = await request(app)
        .post("/api/game-state/session-1/chat")
        .send({ playerId: "player-guest", text: "too many" });
      expect(blocked.status).toBe(429);
    });
  });
});
