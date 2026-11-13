import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("focus styles", () => {
  it("never removes the outline without a replacement", () => {
    for (const file of ["./vr-theme.css", "./bluekey.css"]) {
      expect(read(file)).not.toMatch(/outline:\s*(none|0)\s*;/);
    }
  });

  it("defines a global :focus-visible baseline", () => {
    expect(read("./vr-theme.css")).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  });
});

describe("type size", () => {
  it("never sets text below 0.75rem (12px)", () => {
    for (const file of ["./vr-theme.css", "./bluekey.css"]) {
      const sizes = [...read(file).matchAll(/font-size:\s*([\d.]+)(px|rem|em)\s*;/g)];
      for (const [, value, unit] of sizes) {
        const px = Number(value) * (unit === "px" ? 1 : 16);
        expect(px).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
