import { describe, it, expect } from "vitest";
import {
  applyActiveModelPatch,
  applyPlaylistPatch,
  readPlaylist,
  reconcileActive,
  writePlaylist,
} from "./sessionPlaylist.js";

describe("sessionPlaylist", () => {
  it("readPlaylist normalizes and drops invalid active", () => {
    expect(
      readPlaylist({
        playlist: [" a ", "b", "a", 3, ""],
        activeModelId: "missing",
      }),
    ).toEqual({ playlist: ["a", "b"], activeModelId: null });
  });

  it("reconcileActive keeps preferred or falls back to first", () => {
    expect(reconcileActive(["m1", "m2"], "m2")).toBe("m2");
    expect(reconcileActive(["m1", "m2"], "gone")).toBe("m1");
    expect(reconcileActive([], "m1")).toBeNull();
  });

  it("applyPlaylistPatch replace + append + remove", () => {
    const base = writePlaylist({}, { playlist: ["m1"], activeModelId: "m1" });

    const replaced = applyPlaylistPatch(base, { playlist: ["m2", "m3"] });
    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(replaced.state).toEqual({ playlist: ["m2", "m3"], activeModelId: "m2" });
    }

    const appended = applyPlaylistPatch(base, { append: "m2" });
    expect(appended.ok).toBe(true);
    if (appended.ok) {
      expect(appended.state.playlist).toEqual(["m1", "m2"]);
      expect(appended.state.activeModelId).toBe("m1");
    }

    const removed = applyPlaylistPatch(base, { remove: "m1" });
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.state).toEqual({ playlist: [], activeModelId: null });
    }
  });

  it("applyPlaylistPatch rejects active not in playlist", () => {
    const result = applyPlaylistPatch(
      { playlist: ["m1"] },
      { activeModelId: "m2" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(400);
  });

  it("applyActiveModelPatch requires membership", () => {
    const meta = writePlaylist({}, { playlist: ["m1"], activeModelId: "m1" });
    expect(applyActiveModelPatch(meta, "m2").ok).toBe(false);
    const ok = applyActiveModelPatch(meta, "m1");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.state.activeModelId).toBe("m1");
    const cleared = applyActiveModelPatch(meta, null);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.state.activeModelId).toBeNull();
  });
});
