import { describe, it, expect } from "vitest";
import {
  applyStagePatch,
  guestsMaySwitch,
  readStage,
  seedPlacementsForLayout,
} from "./sessionStage.js";

describe("sessionStage", () => {
  it("defaults to surround + open_stage", () => {
    expect(readStage({})).toEqual({
      stageLayout: "surround",
      guestExperience: "open_stage",
    });
  });

  it("guestsMaySwitch only for browse and open_stage", () => {
    expect(guestsMaySwitch("host_led")).toBe(false);
    expect(guestsMaySwitch("browse")).toBe(true);
    expect(guestsMaySwitch("open_stage")).toBe(true);
  });

  it("even_row seeds spaced positions", () => {
    const seeds = seedPlacementsForLayout(["a", "b", "c"], "even_row");
    expect(seeds.a.position[0]).toBeLessThan(seeds.b.position[0]);
    expect(seeds.b.position[0]).toBeLessThan(seeds.c.position[0]);
  });

  it("applyStagePatch reseeds on layout change", () => {
    const meta = {
      playlist: ["m1", "m2"],
      activeModelId: "m1",
    };
    const result = applyStagePatch(meta, { stageLayout: "even_row" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.stageLayout).toBe("even_row");
    const placements = result.metadata.modelPlacements as Record<string, { position: number[] }>;
    expect(placements.m1.position[0]).not.toBe(placements.m2.position[0]);
  });
});
