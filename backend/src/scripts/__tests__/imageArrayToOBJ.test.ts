import { test } from "vitest";
import assert from "node:assert/strict";
import {
  TopographyMeshGenerator,
  type PixelDataTuple,
} from "../imageArrayToOBJ.js";

const mockInput: PixelDataTuple[] = [
  [0, 0, [0, 0, 0, 255]],
  [1, 0, [128, 0, 0, 255]],
  [0, 1, [128, 0, 0, 255]],
  [1, 1, [255, 0, 0, 255]],
];

test("creates vertices using red values for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInput, "red");

  assert.deepEqual(mesh.vertices, [
    [0, 0, 0],
    [1, 0, 128 / 255],
    [0, 1, 128 / 255],
    [1, 1, 1],
  ]);
});

test("creates two triangles for a 2 by 2 image", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInput, "red");

  assert.deepEqual(mesh.faces, [
    0, 2, 1,
    1, 2, 3,
  ]);
});

test("preserves the original pixel colors", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInput, "red");

  assert.deepEqual(
    mesh.colors,
    mockInput.map(([, , rgba]) => rgba),
  );
});

test("sorts pixels by y and then x", () => {
  const generator = new TopographyMeshGenerator();

  const unorderedInput: PixelDataTuple[] = [
    mockInput[3],
    mockInput[0],
    mockInput[2],
    mockInput[1],
  ];

  const mesh = generator.generate(unorderedInput, "red");

  assert.deepEqual(mesh.vertices, [
    [0, 0, 0],
    [1, 0, 128 / 255],
    [0, 1, 128 / 255],
    [1, 1, 1],
  ]);
});

test("rejects empty input", () => {
  const generator = new TopographyMeshGenerator();

  assert.throws(
    () => generator.generate([], "red"),
    /imageArray must not be empty/,
  );
});

