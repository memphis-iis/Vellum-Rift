import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { sideBySideComposite } from "./sideBySideComposite.js";

async function solidRgba(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Promise<{ data: Buffer; width: number; height: number }> {
  const [r, g, b, a] = rgba;
  const data = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r, g, b, alpha: a },
    },
  })
    .raw()
    .ensureAlpha()
    .toBuffer();
  return { data, width, height };
}

function samplePixel(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("sideBySideComposite", () => {
  it("scale: matches taller height and concatenates widths", async () => {
    const left = await solidRgba(40, 20, [255, 0, 0, 255]);
    const right = await solidRgba(30, 40, [0, 255, 0, 255]);
    const out = await sideBySideComposite(left, right, "scale", 16 * 1024 * 1024);

    expect(out.height).toBe(40);
    // left 40x20 → scale height 40 → width 80; right stays 30x40
    expect(out.width).toBe(80 + 30);
    expect(out.pixelCount).toBe(out.width * out.height);

    expect(samplePixel(out.data, out.width, 0, 0)[0]).toBe(255);
    expect(samplePixel(out.data, out.width, 80, 0)[1]).toBe(255);
  });

  it("pad: keeps native sizes and letterboxes the shorter side", async () => {
    const left = await solidRgba(10, 6, [255, 0, 0, 255]);
    const right = await solidRgba(8, 10, [0, 0, 255, 255]);
    const out = await sideBySideComposite(left, right, "pad", 16 * 1024 * 1024);

    expect(out.height).toBe(10);
    expect(out.width).toBe(18);

    // left padded: top = floor((10-6)/2) = 2 → black above content
    expect(samplePixel(out.data, out.width, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(samplePixel(out.data, out.width, 0, 2)[0]).toBe(255);
    expect(samplePixel(out.data, out.width, 10, 0)[2]).toBe(255);
  });

  it("rejects when combined pixels exceed max", async () => {
    const left = await solidRgba(20, 20, [1, 2, 3, 255]);
    const right = await solidRgba(20, 20, [4, 5, 6, 255]);
    await expect(sideBySideComposite(left, right, "pad", 100)).rejects.toThrow(
      /Combined image too large/,
    );
  });
});
