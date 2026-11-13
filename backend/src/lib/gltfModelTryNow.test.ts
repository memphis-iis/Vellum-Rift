import { describe, it, expect } from "vitest";
import { GlTFModelRepository } from "./gltfModelRepository.js";

describe("GlTFModelRepository.isReadyFor3d", () => {
  it("requires storage key and file size", () => {
    expect(
      GlTFModelRepository.isReadyFor3d({ storageKey: "a.glb", fileSize: 12 }),
    ).toBe(true);
    expect(
      GlTFModelRepository.isReadyFor3d({ storageKey: "", fileSize: 12 }),
    ).toBe(false);
    expect(
      GlTFModelRepository.isReadyFor3d({ storageKey: "a.glb", fileSize: 0 }),
    ).toBe(false);
  });
});
