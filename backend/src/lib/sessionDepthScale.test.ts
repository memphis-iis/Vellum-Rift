import { describe, it, expect } from "vitest";
import {
  clampDepthScale,
  readDepthScale,
  writeDepthScale,
} from "./sessionDepthScale.js";

describe("sessionDepthScale", () => {
  it("defaults to 1", () => {
    expect(readDepthScale(undefined)).toBe(1);
    expect(readDepthScale({})).toBe(1);
    expect(readDepthScale({ depthScale: "2" })).toBe(1);
    expect(readDepthScale({ depthScale: NaN })).toBe(1);
  });

  it("clamps to 0..5", () => {
    expect(clampDepthScale(-1)).toBe(0);
    expect(clampDepthScale(0)).toBe(0);
    expect(clampDepthScale(2.5)).toBe(2.5);
    expect(clampDepthScale(9)).toBe(5);
    expect(clampDepthScale(undefined)).toBeNull();
  });

  it("reads finite stored values", () => {
    expect(readDepthScale({ depthScale: 0 })).toBe(0);
    expect(readDepthScale({ depthScale: 3.25 })).toBe(3.25);
    expect(readDepthScale({ depthScale: 99 })).toBe(5);
  });

  it("writeDepthScale stores clamped value without dropping other keys", () => {
    const base: Record<string, unknown> = { playlist: ["a"] };
    const next = writeDepthScale(base, 2);
    expect(next.depthScale).toBe(2);
    expect(next.playlist).toEqual(["a"]);
    expect(base.depthScale).toBeUndefined();

    expect(writeDepthScale(next, -3).depthScale).toBe(0);
    expect(writeDepthScale(next, 8).depthScale).toBe(5);
  });
});
