import { describe, it, expect } from "vitest";
import { GameState } from "../components/gameState.js";
import {
  pruneStalePlayers,
  touchPlayerPresence,
} from "./sessionPresence.js";

describe("sessionPresence (#253)", () => {
  it("marks connected players stale after TTL", () => {
    const state = new GameState("ttl");
    const host = state.addPlayer("Host", true);
    const guest = state.addPlayer("Guest");
    touchPlayerPresence(host);
    guest.lastSeenAt = new Date(Date.now() - 120_000).toISOString();

    const changed = pruneStalePlayers(state, Date.now(), 90_000);
    expect(changed).toBe(true);
    expect(host.isConnected).toBe(true);
    expect(guest.isConnected).toBe(false);
  });

  it("uses joinedAt when lastSeenAt is missing", () => {
    const state = new GameState("ttl");
    const guest = state.addPlayer("Guest");
    guest.joinedAt = new Date(Date.now() - 200_000).toISOString();
    delete guest.lastSeenAt;

    expect(pruneStalePlayers(state, Date.now(), 90_000)).toBe(true);
    expect(guest.isConnected).toBe(false);
  });
});
