import { test } from "vitest";
import {
  TopographyMeshGenerator,
  GLTFExporter,
  type PixelDataTuple,
} from "../imageArrayToOBJ.js";

test.skip("generate a 32x32 gradient glTF file (manual)", { timeout: 30_000 }, async () => {
  const SIZE = 32;
  const imageArray: PixelDataTuple[] = [];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = Math.round((x / (SIZE - 1)) * 255);
      const g = Math.round((y / (SIZE - 1)) * 255);
      const b = 128;
      const a = 255;
      imageArray.push([x, y, [r, g, b, a]]);
    }
  }

  const generator = new TopographyMeshGenerator();
  const mesh = generator.generate(imageArray, "red");

  const exporter = new GLTFExporter();
  await exporter.export(mesh, "/tmp/topography-red.glb");
});

test.skip("generate a radial peak glTF file (manual)", { timeout: 30_000 }, async () => {
  const SIZE = 32;
  const imageArray: PixelDataTuple[] = [];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cx = SIZE / 2 - 0.5;
      const cy = SIZE / 2 - 0.5;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const peak = Math.max(0, 255 - Math.round((dist / (SIZE / 2)) * 255));
      imageArray.push([x, y, [peak, peak, peak, 255]]);
    }
  }

  const generator = new TopographyMeshGenerator();
  const mesh = generator.generate(imageArray, "red");

  const exporter = new GLTFExporter();
  await exporter.export(mesh, "/tmp/topography-peak.glb");
});

test.skip("generate glTF from mock test data (manual)", { timeout: 30_000 }, async () => {
  const mockInput: PixelDataTuple[] = [
    [0, 0, [0, 0, 0, 255]],
    [1, 0, [128, 0, 0, 255]],
    [0, 1, [128, 0, 0, 255]],
    [1, 1, [255, 0, 0, 255]],
  ];

  const generator = new TopographyMeshGenerator();
  const mesh = generator.generate(mockInput, "red");

  const exporter = new GLTFExporter();
  await exporter.export(mesh, "/tmp/topography-mock.glb");
});