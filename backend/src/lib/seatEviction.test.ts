import { describe, it, expect } from "vitest";

/** Mirrors web-dashboard/src/lib/seatEviction.ts for backend CI coverage. */
function evaluateSeatEviction(
  players: ReadonlyArray<{ id: string; connectionId?: string | null }> | null | undefined,
  localPlayerId: string | null | undefined,
  localConnectionId: string | null | undefined,
): "kick" | "takeover" | null {
  if (!localPlayerId) return null;
  const self = players?.find((p) => p && p.id === localPlayerId);
  if (!self) return "kick";
  if (
    localConnectionId &&
    self.connectionId &&
    self.connectionId !== localConnectionId
  ) {
    return "takeover";
  }
  return null;
}

describe("seat eviction evaluate", () => {
  it("returns kick when self is missing", () => {
    expect(evaluateSeatEviction([{ id: "a", connectionId: "c1" }], "b", "c1")).toBe(
      "kick",
    );
  });

  it("returns takeover when connectionId differs", () => {
    expect(
      evaluateSeatEviction([{ id: "a", connectionId: "c2" }], "a", "c1"),
    ).toBe("takeover");
  });

  it("returns null when seat is still owned", () => {
    expect(
      evaluateSeatEviction([{ id: "a", connectionId: "c1" }], "a", "c1"),
    ).toBeNull();
  });
});
