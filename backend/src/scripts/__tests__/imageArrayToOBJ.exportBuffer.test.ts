import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import { TopographyMeshGenerator, GLTFExporter, type PixelDataTuple } from "../imageArrayToOBJ.js";

const mockInput: PixelDataTuple[] = [
  [0, 0, [0, 0, 0, 255]],
  [1, 0, [128, 0, 0, 255]],
  [0, 1, [128, 0, 0, 255]],
  [1, 1, [255, 0, 0, 255]],
];

describe("GLTFExporter.exportToBuffer", () => {
  it("returns a non-empty Buffer for valid mesh data", async () => {
    const generator = new TopographyMeshGenerator();
    const mesh = generator.generate(mockInput, "red");

    const exporter = new GLTFExporter();
    const buffer = await exporter.exportToBuffer(mesh);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("produces a valid glTF Binary magic header (glTF = 0x46546C67)", async () => {
    const generator = new TopographyMeshGenerator();
    const mesh = generator.generate(mockInput, "red");

    const exporter = new GLTFExporter();
    const buffer = await exporter.exportToBuffer(mesh);

    // First 4 bytes of a .glb file must be the ASCII string "glTF"
    const magic = buffer.readUInt32LE(0);
    assert.strictEqual(magic, 0x46546C67, "Expected glTF magic header");
  });

  it("produces version 2 in bytes 4-7", async () => {
    const generator = new TopographyMeshGenerator();
    const mesh = generator.generate(mockInput, "red");

    const exporter = new GLTFExporter();
    const buffer = await exporter.exportToBuffer(mesh);

    const version = buffer.readUInt32LE(4);
    assert.strictEqual(version, 2, "Expected glTF version 2");
  });

  it("throws when vertex count does not match color count", async () => {
    const exporter = new GLTFExporter();
    await expect(
      exporter.exportToBuffer({
        vertices: [[0, 0, 0], [1, 0, 0]],
        faces: [],
        colors: [[255, 0, 0, 255]], // only 1 color for 2 vertices
      }),
    ).rejects.toThrow("Each vertex must have exactly one color");
  });

  it("buffer size grows with more vertices", async () => {
    const generator = new TopographyMeshGenerator();
    const exporter = new GLTFExporter();

    // 2x2 mesh
    const smallMesh = generator.generate(mockInput, "red");
    const smallBuffer = await exporter.exportToBuffer(smallMesh);

    // Build a bigger 4x4 mesh
    const bigPixels: PixelDataTuple[] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        bigPixels.push([x, y, [128, 128, 128, 255]]);
      }
    }
    const bigMesh = generator.generate(bigPixels, "red");
    const bigBuffer = await exporter.exportToBuffer(bigMesh);

    expect(bigBuffer.length).toBeGreaterThan(smallBuffer.length);
  });
});
