import { describe, it, expect, vi, afterEach } from "vitest";
import { GameState, getGameStateStats } from "./gameState.js";

describe("GameState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------
  describe("constructor", () => {
    it("generates a unique sessionId", () => {
      const a = new GameState();
      const b = new GameState();
      expect(a.sessionId).toBeTruthy();
      expect(a.sessionId).not.toBe(b.sessionId);
    });

    it("accepts an optional label", () => {
      const state = new GameState("test-session");
      expect(state.label).toBe("test-session");
    });

    it("defaults label to empty string", () => {
      const state = new GameState();
      expect(state.label).toBe("");
    });

    it("starts with no players and no host", () => {
      const state = new GameState();
      expect(state.players).toHaveLength(0);
      expect(state.hostId).toBe("");
    });

    it("starts active with timestamps", () => {
      const state = new GameState();
      expect(state.isActive).toBe(true);
      expect(state.createdAt).toBeTruthy();
      expect(state.updatedAt).toBe(state.createdAt);
    });

    it("initialises metadata", () => {
      const state = new GameState();
      expect(state.metadata).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // addPlayer
  // ---------------------------------------------------------------
  describe("addPlayer", () => {
    it("adds a player and returns the PlayerState", () => {
      const state = new GameState();
      const player = state.addPlayer("Alice");

      expect(player.id).toBeTruthy();
      expect(player.displayName).toBe("Alice");
      expect(state.players).toHaveLength(1);
    });

    it("sets default position and rotation to zero", () => {
      const state = new GameState();
      const player = state.addPlayer("Bob");
      expect(player.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(player.rotation).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("marks the player as connected", () => {
      const state = new GameState();
      const player = state.addPlayer("Charlie");
      expect(player.isConnected).toBe(true);
    });

    it("sets the added player as host when isHost is true", () => {
      const state = new GameState();
      const player = state.addPlayer("Dave", true);
      expect(player.isHost).toBe(true);
      expect(state.hostId).toBe(player.id);
    });

    it("does not set hostId when isHost is false", () => {
      const state = new GameState();
      state.addPlayer("Eve", false);
      expect(state.hostId).toBe("");
    });

    it("bumps updatedAt", () => {
      vi.useFakeTimers();
      const state = new GameState();
      state.addPlayer("Frank");
      const afterAdd = state.updatedAt;
      vi.advanceTimersByTime(1);
      state.addPlayer("Second");
      expect(state.updatedAt).not.toBe(afterAdd);
    });
  });

  // ---------------------------------------------------------------
  // removePlayer
  // ---------------------------------------------------------------
  describe("removePlayer", () => {
    it("removes an existing player and returns true", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      expect(state.players).toHaveLength(1);

      const result = state.removePlayer(p.id);
      expect(result).toBe(true);
      expect(state.players).toHaveLength(0);
    });

    it("returns false for a non-existent player", () => {
      const state = new GameState();
      expect(state.removePlayer("nonexistent")).toBe(false);
    });

    it("bumps updatedAt on removal", () => {
      vi.useFakeTimers();
      const state = new GameState();
      const p = state.addPlayer("Alice");
      const before = state.updatedAt;
      vi.advanceTimersByTime(1);
      state.removePlayer(p.id);
      expect(state.updatedAt).not.toBe(before);
    });
  });

  // ---------------------------------------------------------------
  // getPlayer
  // ---------------------------------------------------------------
  describe("getPlayer", () => {
    it("finds a player by id", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      expect(state.getPlayer(p.id)).toBe(p);
    });

    it("returns undefined for unknown id", () => {
      const state = new GameState();
      expect(state.getPlayer("missing")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------
  describe("addChatMessage", () => {
    it("adds a message attributed to the player", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");

      const msg = state.addChatMessage(p.id, "hello");
      expect(msg).not.toBeNull();
      expect(msg!.playerId).toBe(p.id);
      expect(msg!.displayName).toBe("Alice");
      expect(msg!.text).toBe("hello");
      expect(msg!.id).toBeTruthy();
      expect(msg!.sentAt).toBeTruthy();
    });

    it("returns null for an unknown player", () => {
      const state = new GameState();
      expect(state.addChatMessage("missing", "hello")).toBeNull();
    });

    it("persists messages in chronological order", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      state.addChatMessage(p.id, "one");
      state.addChatMessage(p.id, "two");

      const messages = state.getChatMessages();
      expect(messages.map((m) => m.text)).toEqual(["one", "two"]);
    });

    it("caps history at the configured maximum", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      for (let i = 0; i < 250; i++) {
        state.addChatMessage(p.id, `msg ${i}`);
      }

      expect(state.getChatMessages()).toHaveLength(200);
      expect(state.getChatMessages()[0]!.text).toBe("msg 50");
    });

    it("getChatMessages defaults to an empty array with no history", () => {
      const state = new GameState();
      expect(state.getChatMessages()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // addSystemMessage
  // ---------------------------------------------------------------
  describe("addSystemMessage", () => {
    it("adds a system message not attributed to a player", () => {
      const state = new GameState();
      const msg = state.addSystemMessage("Alice joined the session");

      expect(msg.id).toBeTruthy();
      expect(msg.playerId).toBe("");
      expect(msg.displayName).toBe("");
      expect(msg.system).toBe(true);
      expect(msg.text).toBe("Alice joined the session");
      expect(state.getChatMessages()).toHaveLength(1);
    });

    it("persists system and player messages in chronological order", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      state.addSystemMessage("Alice joined the session");
      state.addChatMessage(p.id, "hello");

      const messages = state.getChatMessages();
      expect(messages[0]!.system).toBe(true);
      expect(messages[1]!.text).toBe("hello");
    });

    it("caps history including system messages", () => {
      const state = new GameState();
      for (let i = 0; i < 250; i++) {
        state.addSystemMessage(`msg ${i}`);
      }
      expect(state.getChatMessages()).toHaveLength(200);
    });
  });

  // ---------------------------------------------------------------
  // updatePosition
  // ---------------------------------------------------------------
  describe("updatePosition", () => {
    it("updates the player's position", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      const pos = { x: 10, y: 20, z: 30 };

      const result = state.updatePosition(p.id, pos);
      expect(result).toBe(true);
      expect(state.getPlayer(p.id)!.position).toEqual(pos);
    });

    it("returns false for unknown player", () => {
      const state = new GameState();
      expect(state.updatePosition("bad", { x: 1, y: 2, z: 3 })).toBe(false);
    });

    it("bumps updatedAt", () => {
      vi.useFakeTimers();
      const state = new GameState();
      const p = state.addPlayer("Alice");
      const before = state.updatedAt;
      vi.advanceTimersByTime(1);
      state.updatePosition(p.id, { x: 5, y: 5, z: 5 });
      expect(state.updatedAt).not.toBe(before);
    });
  });

  // ---------------------------------------------------------------
  // updateRotation
  // ---------------------------------------------------------------
  describe("updateRotation", () => {
    it("updates the player's rotation", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      const rot = { x: 90, y: 45, z: 0 };

      expect(state.updateRotation(p.id, rot)).toBe(true);
      expect(state.getPlayer(p.id)!.rotation).toEqual(rot);
    });

    it("returns false for unknown player", () => {
      const state = new GameState();
      expect(state.updateRotation("bad", { x: 0, y: 0, z: 0 })).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // setHost
  // ---------------------------------------------------------------
  describe("setHost", () => {
    it("transfers host to another player", () => {
      const state = new GameState();
      const p1 = state.addPlayer("Alice", true);
      const p2 = state.addPlayer("Bob");

      expect(state.setHost(p2.id)).toBe(true);
      expect(p1.isHost).toBe(false);
      expect(p2.isHost).toBe(true);
      expect(state.hostId).toBe(p2.id);
    });

    it("returns false for unknown player", () => {
      const state = new GameState();
      expect(state.setHost("ghost")).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // setConnected
  // ---------------------------------------------------------------
  describe("setConnected", () => {
    it("marks a player as disconnected", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      expect(state.setConnected(p.id, false)).toBe(true);
      expect(p.isConnected).toBe(false);
    });

    it("marks a player as connected again", () => {
      const state = new GameState();
      const p = state.addPlayer("Alice");
      state.setConnected(p.id, false);
      state.setConnected(p.id, true);
      expect(p.isConnected).toBe(true);
    });

    it("returns false for unknown player", () => {
      const state = new GameState();
      expect(state.setConnected("missing", false)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------
  describe("end / resume", () => {
    it("marks the session as inactive", () => {
      const state = new GameState();
      state.end();
      expect(state.isActive).toBe(false);
    });

    it("resume re-activates a session", () => {
      const state = new GameState();
      state.end();
      state.resume();
      expect(state.isActive).toBe(true);
    });

    it("end bumps updatedAt", () => {
      vi.useFakeTimers();
      const state = new GameState();
      const before = state.updatedAt;
      vi.advanceTimersByTime(1);
      state.end();
      expect(state.updatedAt).not.toBe(before);
    });
  });

  // ---------------------------------------------------------------
  // toJSON
  // ---------------------------------------------------------------
  describe("toJSON", () => {
    it("returns a plain object with all top-level fields", () => {
      const state = new GameState("json-test");
      state.addPlayer("Alice");
      const json = state.toJSON();

      expect(json.sessionId).toBe(state.sessionId);
      expect(json.label).toBe("json-test");
      expect(json.isActive).toBe(true);
      expect(json.players).toHaveLength(1);
      expect(json.metadata).toEqual({});
    });

    it("metadata is a shallow copy", () => {
      const state = new GameState();
      const json = state.toJSON();
      expect(json.metadata).not.toBe(state.metadata);
    });
  });
});

describe("getGameStateStats", () => {
  it("returns zeros when there are no sessions", () => {
    expect(getGameStateStats([])).toEqual({
      totalSessionsCreated: 0,
      activeSessions: 0,
      totalPlayers: 0,
      connectedPlayers: 0,
      orphanedSessions: 0,
      avgPlayersPerActiveSession: 0,
    });
  });

  it("calculates statistics across active and ended sessions", () => {
    const hosted = new GameState("hosted");
    hosted.addPlayer("Host", true);
    const disconnected = hosted.addPlayer("Disconnected");
    hosted.setConnected(disconnected.id, false);

    const orphaned = new GameState("orphaned");
    orphaned.addPlayer("Player");

    const ended = new GameState("ended");
    ended.addPlayer("Former host", true);
    ended.end();

    expect(getGameStateStats([hosted, orphaned, ended])).toEqual({
      totalSessionsCreated: 3,
      activeSessions: 2,
      totalPlayers: 4,
      connectedPlayers: 3,
      orphanedSessions: 1,
      avgPlayersPerActiveSession: 2,
    });
  });

  //creates a session without a host, then ends it, shouldn't be counted as orphaned
  it("does not count an ended session as orphaned", () => {
    const ended = new GameState();
    ended.addPlayer("Player");
    ended.end();

    expect(getGameStateStats([ended]).orphanedSessions).toBe(0);
  });

  it("rounds the average to one decimal place", () => {
    const sessions = [
      new GameState(),
      new GameState(),
      new GameState(),
    ];

    for (let index = 0; index < 14; index++) {
      sessions[index % 3].addPlayer(`Player ${index}`, index < 3);
    }

    expect(
      getGameStateStats(sessions).avgPlayersPerActiveSession,
    ).toBe(4.7);
  });
});