import { describe, it, expect } from "vitest";
import { GameState } from "../components/gameState.js";

/**
 * Helper to build a shared GameState with two players for integration tests.
 */
function buildSession(): GameState {
  const state = new GameState("int-test");
  state.addPlayer("Alice", true); // host
  state.addPlayer("Bob");
  return state;
}

// We test each route handler logic directly by exercising the class methods.
// Full HTTP integration (superagent / supertest) is deliberately omitted for now
// since the routes are thin wrappers. The in-memory store pattern is tested here.

describe("GameState route logic", () => {
  describe("POST /api/game-state", () => {
    it("creates a new session with a label", () => {
      const state = new GameState("hello");
      expect(state.sessionId).toBeTruthy();
      expect(state.label).toBe("hello");
    });

    it("creates a session without a label", () => {
      const state = new GameState();
      expect(state.label).toBe("");
    });
  });

  describe("GET /api/game-state/:sessionId", () => {
    it("returns a session by id", () => {
      const state = buildSession();
      const json = state.toJSON();
      expect(json.sessionId).toBe(state.sessionId);
    });
  });

  describe("DELETE /api/game-state/:sessionId", () => {
    it("ends a session", () => {
      const state = buildSession();
      state.end();
      expect(state.isActive).toBe(false);
    });
  });

  describe("POST /api/game-state/:sessionId/players", () => {
    it("adds a non-host player", () => {
      const state = buildSession();
      const player = state.addPlayer("Charlie");
      expect(state.players).toHaveLength(3);
      expect(player.isHost).toBe(false);
    });

    it("emits a join announcement as a system chat message", () => {
      const state = buildSession();
      state.addPlayer("Charlie");
      state.addSystemMessage("Charlie joined the session");

      const messages = state.getChatMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.system).toBe(true);
      expect(messages[0]!.text).toBe("Charlie joined the session");
    });

    it("adds a host player", () => {
      const state = buildSession();
      const player = state.addPlayer("Host2", true);
      expect(player.isHost).toBe(true);
      expect(state.hostId).toBe(player.id);
    });
  });

  describe("DELETE /api/game-state/:sessionId/players/:playerId", () => {
    it("removes a player by id", () => {
      const state = buildSession();
      const playerCount = state.players.length;
      const removed = state.removePlayer(state.players[1].id);
      expect(removed).toBe(true);
      expect(state.players).toHaveLength(playerCount - 1);
    });

    it("returns false for a missing player", () => {
      const state = buildSession();
      expect(state.removePlayer("nope")).toBe(false);
    });
  });

  describe("PATCH /api/game-state/:sessionId/position", () => {
    it("updates the first player's position", () => {
      const state = buildSession();
      const alice = state.players[0];
      const updated = state.updatePosition(alice.id, { x: 1, y: 2, z: 3 });
      expect(updated).toBe(true);
      expect(state.getPlayer(alice.id)!.position).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe("PATCH /api/game-state/:sessionId/rotation", () => {
    it("updates a player's rotation", () => {
      const state = buildSession();
      const bob = state.players[1];
      const updated = state.updateRotation(bob.id, { x: 45, y: 90, z: 0 });
      expect(updated).toBe(true);
      expect(state.getPlayer(bob.id)!.rotation).toEqual({ x: 45, y: 90, z: 0 });
    });
  });

  describe("PATCH /api/game-state/:sessionId/host", () => {
    it("transfers host", () => {
      const state = buildSession();
      const bob = state.players[1];
      state.setHost(bob.id);
      expect(state.hostId).toBe(bob.id);
      expect(bob.isHost).toBe(true);
      expect(state.players[0].isHost).toBe(false);
    });
  });

  describe("PATCH /api/game-state/:sessionId/connection", () => {
    it("marks a player as disconnected", () => {
      const state = buildSession();
      const bob = state.players[1];
      state.setConnected(bob.id, false);
      expect(bob.isConnected).toBe(false);
    });
  });

  describe("POST /api/game-state/:sessionId/chat", () => {
    it("adds a message from an existing player", () => {
      const state = buildSession();
      const alice = state.players[0];

      const message = state.addChatMessage(alice.id, "hello team");
      expect(message).not.toBeNull();
      expect(state.getChatMessages()).toHaveLength(1);
      expect(state.getChatMessages()[0]!.displayName).toBe("Alice");
    });

    it("rejects a message from an unknown player", () => {
      const state = buildSession();
      expect(state.addChatMessage("ghost", "hello")).toBeNull();
      expect(state.getChatMessages()).toHaveLength(0);
    });
  });

  describe("GET /api/game-state/:sessionId/chat", () => {
    it("returns messages in chronological order", () => {
      const state = buildSession();
      const alice = state.players[0];
      const bob = state.players[1];

      state.addChatMessage(alice.id, "first");
      state.addChatMessage(bob.id, "second");

      expect(state.getChatMessages().map((m) => m.text)).toEqual(["first", "second"]);
    });

    it("returns an empty list for a session with no chat", () => {
      expect(buildSession().getChatMessages()).toEqual([]);
    });
  });
});
