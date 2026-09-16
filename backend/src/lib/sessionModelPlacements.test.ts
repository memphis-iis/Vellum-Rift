import { describe, it, expect } from "vitest";
import {
  applyModelPlacementsPatch,
  defaultPlacement,
  readModelPlacements,
  syncPlacementsWithPlaylist,
  writeModelPlacements,
} from "../lib/sessionModelPlacements.js";

describe("sessionModelPlacements", () => {
  it("reads empty placements", () => {
    const state = readModelPlacements({}, []);
    expect(state.selectedModelId).toBeNull();
    expect(state.modelPlacements).toEqual({});
  });

  it("syncs defaults for new playlist ids", () => {
    const synced = syncPlacementsWithPlaylist(["a"], {});
    expect(synced.a).toEqual(defaultPlacement());
  });

  it("patches placement and selection", () => {
    const metadata = writeModelPlacements(
      { playlist: ["a", "b"] },
      { selectedModelId: "a", modelPlacements: { a: defaultPlacement() } },
    );
    const result = applyModelPlacementsPatch(metadata, ["a", "b"], {
      selectedModelId: "b",
      placements: {
        b: { position: [1, 2, 3], rotation: [0, 90, 0], scale: 2 },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.selectedModelId).toBe("b");
    expect(result.state.modelPlacements.b.position).toEqual([1, 2, 3]);
  });

  it("rejects selection outside playlist", () => {
    const result = applyModelPlacementsPatch({}, ["a"], {
      selectedModelId: "b",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.statusCode).toBe(400);
  });
});
