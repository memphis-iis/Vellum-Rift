import { describe, it, expect } from "vitest";
import {
  applyRotationPatch,
  parseRotationMinutes,
  readSessionRotation,
  writeSessionRotation,
} from "./sessionRotation.js";

const NOW = Date.parse("2026-09-15T17:00:00.000Z");

describe("sessionRotation", () => {
  it("defaults to playing with no timer", () => {
    expect(readSessionRotation(undefined, NOW)).toEqual({
      experiencePhase: "playing",
      rotationEndsAt: null,
    });
    expect(readSessionRotation({}, NOW).experiencePhase).toBe("playing");
  });

  it("parses only preset minutes", () => {
    for (const m of [5, 8, 10, 12]) expect(parseRotationMinutes(m)).toBe(m);
    expect(parseRotationMinutes(7)).toBeNull();
    expect(parseRotationMinutes("5")).toBeNull();
    expect(parseRotationMinutes(5.5)).toBeNull();
  });

  it("start turn sets playing + server-clock end time", () => {
    const patched = applyRotationPatch({ playlist: ["a"] }, { rotationMinutes: 8 }, NOW);
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.metadata.experiencePhase).toBe("playing");
    expect(patched.metadata.rotationEndsAt).toBe("2026-09-15T17:08:00.000Z");
    expect(patched.metadata.playlist).toEqual(["a"]);
  });

  it("accepts explicit playing + minutes", () => {
    const patched = applyRotationPatch(
      {},
      { experiencePhase: "playing", rotationMinutes: 12 },
      NOW,
    );
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.metadata.rotationEndsAt).toBe("2026-09-15T17:12:00.000Z");
  });

  it("reset forces ended and clears the timer", () => {
    const started = applyRotationPatch({}, { rotationMinutes: 5 }, NOW);
    if (!started.ok) throw new Error("expected ok");
    const reset = applyRotationPatch(started.metadata, { experiencePhase: "ended" }, NOW);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.metadata.experiencePhase).toBe("ended");
    expect(reset.metadata.rotationEndsAt).toBeUndefined();
    expect(readSessionRotation(reset.metadata, NOW)).toEqual({
      experiencePhase: "ended",
      rotationEndsAt: null,
    });
  });

  it("rejects invalid bodies", () => {
    expect(applyRotationPatch({}, {}, NOW).ok).toBe(false);
    expect(applyRotationPatch({}, { rotationMinutes: 7 }, NOW).ok).toBe(false);
    expect(applyRotationPatch({}, { experiencePhase: "paused" }, NOW).ok).toBe(false);
    expect(applyRotationPatch({}, { experiencePhase: "playing" }, NOW).ok).toBe(false);
    expect(
      applyRotationPatch({}, { experiencePhase: "ended", rotationMinutes: 5 }, NOW).ok,
    ).toBe(false);
  });

  it("clamps an expired playing turn to ended on read", () => {
    const meta = writeSessionRotation(
      {},
      { experiencePhase: "playing", rotationEndsAt: "2026-09-15T17:05:00.000Z" },
    );
    expect(readSessionRotation(meta, NOW).experiencePhase).toBe("playing");
    expect(readSessionRotation(meta, Date.parse("2026-09-15T17:05:00.000Z"))).toEqual({
      experiencePhase: "ended",
      rotationEndsAt: "2026-09-15T17:05:00.000Z",
    });
    expect(readSessionRotation(meta, NOW + 10 * 60_000).experiencePhase).toBe("ended");
  });
});
