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
