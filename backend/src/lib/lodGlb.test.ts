import { describe, it, expect } from "vitest";
import { NodeIO } from "@gltf-transform/core";

import { GLTFExporter, TopographyMeshGenerator } from "../scripts/imageArrayToOBJ.js";
import { lodStorageKey, sampleAxis, subsampleGlb } from "./lodGlb.js";

async function gridGlb(width: number, height: number): Promise<Buffer> {
  const pixels: [number, number, [number, number, number, number]][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.push([x, y, [x, y, 0, 255]]);
    }
  }
  const mesh = new TopographyMeshGenerator().generate(pixels, "red", 1);
  return new GLTFExporter().exportToBuffer(mesh);
}

async function vertexPositions(glb: Buffer): Promise<Float32Array> {
  const doc = await new NodeIO().readBinary(new Uint8Array(glb));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  return prim.getAttribute("POSITION")!.getArray() as Float32Array;
}

describe("lodGlb", () => {
  it("names the cache beside the original object", () => {
    expect(lodStorageKey("models/test-abc123.glb", "quest")).toBe(
      "models/test-abc123.quest.glb",
    );
  });

  it("keeps both ends of an axis when the stride does not land on the last index", () => {
    expect(sampleAxis(8, 3)).toEqual([0, 3, 6, 7]);
  });

  it("returns the original buffer when the mesh is already inside the budget", async () => {
    const glb = await gridGlb(4, 4);
    const result = await subsampleGlb(glb, {
      maxVertices: 100_000,
      maxTextureSize: 512,
      width: 4,
      height: 4,
    });
    expect(result.changed).toBe(false);
    expect(result.vertexCount).toBe(16);
    expect(result.glb).toBe(glb);
  });

  it("subsamples a row-major grid and keeps the corners", async () => {
    const glb = await gridGlb(8, 8);
    const result = await subsampleGlb(glb, {
      maxVertices: 16,
      maxTextureSize: 512,
      width: 8,
      height: 8,
    });

    expect(result.changed).toBe(true);
    expect(result.vertexCount).toBeLessThanOrEqual(16);
    expect(result.vertexCount).toBeGreaterThanOrEqual(4);

    const pos = await vertexPositions(result.glb);
    expect(pos[0]).toBe(0);
    expect(pos[1]).toBe(0);
    const last = pos.length - 3;
    expect(pos[last]).toBe(7);
    expect(pos[last + 1]).toBe(7);
  });
});
