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

// Pixels with non-zero green, blue, and alpha so all height modes can be tested
const mockInputFull: PixelDataTuple[] = [
  [0, 0, [10, 20, 30, 64]],
  [1, 0, [40, 80, 120, 128]],
  [0, 1, [100, 160, 200, 192]],
  [1, 1, [200, 220, 250, 255]],
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

test("creates vertices using green values for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInputFull, "green");

  assert.deepEqual(mesh.vertices, [
    [0, 0, 20 / 255],
    [1, 0, 80 / 255],
    [0, 1, 160 / 255],
    [1, 1, 220 / 255],
  ]);
});

test("creates vertices using blue values for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInputFull, "blue");

  assert.deepEqual(mesh.vertices, [
    [0, 0, 30 / 255],
    [1, 0, 120 / 255],
    [0, 1, 200 / 255],
    [1, 1, 250 / 255],
  ]);
});

test("creates vertices using alpha values for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInputFull, "alpha");

  assert.deepEqual(mesh.vertices, [
    [0, 0, 64 / 255],
    [1, 0, 128 / 255],
    [0, 1, 192 / 255],
    [1, 1, 1],
  ]);
});

test("creates vertices using brightness for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInputFull, "brightness");

  // brightness = (r + g + b) / 3 / 255
  const expected = mockInputFull.map(
    ([, , [r, g, b]]) => (r + g + b) / 3 / 255,
  );
  const actual = mesh.vertices.map(([, , z]) => z);

  assert.deepEqual(actual, expected);
});

test("creates vertices using grayscale (BT.601 luminance) for height", () => {
  const generator = new TopographyMeshGenerator();

  const mesh = generator.generate(mockInputFull, "grayscale");

  // grayscale = (0.299*R + 0.587*G + 0.114*B) / 255
  const expected = mockInputFull.map(
    ([, , [r, g, b]]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255,
  );
  const actual = mesh.vertices.map(([, , z]) => z);

  assert.deepEqual(actual, expected);
});

test("creates vertices using contrast for height", () => {
  const generator = new TopographyMeshGenerator();

  // Use pixels with known luminance values:
  // pure black (0,0,0) → luminance=0 → contrast=1
  // mid-gray (128,128,128) → luminance≈0.5 → contrast≈0
  // pure white (255,255,255) → luminance=1 → contrast=1
  const contrastInput: PixelDataTuple[] = [
    [0, 0, [0, 0, 0, 255]],       // black → contrast ≈ 1
    [1, 0, [128, 128, 128, 255]], // mid-gray → contrast ≈ 0
    [0, 1, [64, 64, 64, 255]],    // dark gray → luminance≈0.25 → contrast=0.5
    [1, 1, [255, 255, 255, 255]], // white → contrast ≈ 1
  ];

  const mesh = generator.generate(contrastInput, "contrast");

  // Verify: mid-gray should be near 0, extremes near 1
  assert.ok(mesh.vertices[1][2] < 0.05, "mid-gray contrast should be near 0");
  assert.ok(mesh.vertices[0][2] > 0.95, "black contrast should be near 1");
  assert.ok(mesh.vertices[3][2] > 0.95, "white contrast should be near 1");
  // Dark gray (luminance ~0.25) → |0.25 - 0.5| * 2 = 0.5
  assert.ok(
    Math.abs(mesh.vertices[2][2] - 0.5) < 0.05,
    "dark gray contrast should be near 0.5",
  );
});

test("grayscale differs from brightness for non-uniform RGB", () => {
  const generator = new TopographyMeshGenerator();

  // Pixel where R=255, G=0, B=0: brightness = 85/255 ≈ 0.333, grayscale = 0.299*1 ≈ 0.299
  const rgbInput: PixelDataTuple[] = [
    [0, 0, [255, 0, 0, 255]],
  ];

  const brightnessMesh = generator.generate(rgbInput, "brightness");
  const grayscaleMesh = generator.generate(rgbInput, "grayscale");

  // brightness = (255+0+0)/3/255 = 0.333...
  // grayscale = 0.299*255/255 = 0.299
  assert.ok(
    Math.abs(brightnessMesh.vertices[0][2] - grayscaleMesh.vertices[0][2]) > 0.01,
    "grayscale and brightness should differ for non-uniform RGB",
  );
});

