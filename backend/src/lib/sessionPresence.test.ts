import { describe, it, expect, vi, afterEach } from "vitest";
import { GameState } from "../components/gameState.js";
import {
  DEFAULT_GUEST_IDLE_MS,
  expireStaleLasers,
  markIdleDisconnected,
  pruneStaleArtifacts,
  pruneStalePlayers,
  touchPlayerLaser,
  touchPlayerSeen,
} from "./sessionPresence.js";

describe("sessionPresence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps host and recent guests; drops idle non-host players after 3 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T18:00:00.000Z"));

    const state = new GameState("Museum");
    const host = state.addPlayer("Host", true);
    host.joinedAt = "2026-09-11T17:40:43.027Z";

    const recent = state.addPlayer("RecentGuest");
    recent.joinedAt = "2026-09-29T17:58:00.000Z";

    const stale = state.addPlayer("StaleGuest");
    stale.joinedAt = "2026-09-29T17:50:00.000Z";

    const removed = pruneStalePlayers(state, DEFAULT_GUEST_IDLE_MS, Date.now());
    expect(removed).toBe(1);
    expect(state.players.map((p) => p.displayName).sort()).toEqual([
      "Host",
      "RecentGuest",
    ]);
  });

  it("prefers lastSeenAt over joinedAt when deciding staleness", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T18:00:00.000Z"));

    const state = new GameState("Museum");
    state.addPlayer("Host", true);

    const oldJoinButActive = state.addPlayer("Active");
    oldJoinButActive.joinedAt = "2026-09-01T00:00:00.000Z";
    touchPlayerSeen(oldJoinButActive, "2026-09-29T17:58:00.000Z");

    const removed = pruneStalePlayers(state, DEFAULT_GUEST_IDLE_MS, Date.now());
    expect(removed).toBe(0);
    expect(state.players).toHaveLength(2);
  });

  it("expires lasers without a fresh lastLaserAt heartbeat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T18:00:00.000Z"));

    const state = new GameState("Museum");
    const host = state.addPlayer("Host", true);
    host.laserActive = true;
    expect(expireStaleLasers(state, 2500, Date.now())).toBe(1);
    expect(host.laserActive).toBe(false);

    host.laserActive = true;
    touchPlayerLaser(host, "2026-09-29T17:59:59.000Z");
    expect(expireStaleLasers(state, 2500, Date.now())).toBe(0);
    expect(host.laserActive).toBe(true);

    vi.setSystemTime(new Date("2026-09-29T18:00:05.000Z"));
    expect(expireStaleLasers(state, 2500, Date.now())).toBe(1);
    expect(host.laserActive).toBe(false);
  });

  it("marks idle connected players disconnected and clears their laser", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T18:00:00.000Z"));

    const state = new GameState("Museum");
    const host = state.addPlayer("Host", true);
    host.joinedAt = "2026-09-11T17:40:43.027Z";
    host.laserActive = true;
    host.isConnected = true;

    expect(markIdleDisconnected(state, DEFAULT_GUEST_IDLE_MS, Date.now())).toBe(1);
    expect(host.isConnected).toBe(false);
    expect(host.laserActive).toBe(false);
  });

  it("prunes old metadata artifacts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T18:00:00.000Z"));

    const state = new GameState("Museum");
    state.metadata.artifacts = [
      {
        id: "old",
        label: "x",
        createdAt: "2026-09-16T17:49:12.035Z",
        updatedAt: "2026-09-16T17:49:12.035Z",
      },
      {
        id: "new",
        label: "fresh",
        createdAt: "2026-09-29T17:00:00.000Z",
        updatedAt: "2026-09-29T17:00:00.000Z",
      },
    ];

    const removed = pruneStaleArtifacts(state, 24, Date.now());
    expect(removed).toBe(1);
    expect((state.metadata.artifacts as { id: string }[]).map((a) => a.id)).toEqual([
      "new",
    ]);
  });
});
