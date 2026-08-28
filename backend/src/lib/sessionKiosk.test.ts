import { describe, it, expect } from "vitest";
import { readKioskEnabled, writeKioskEnabled } from "./sessionKiosk.js";

describe("sessionKiosk", () => {
  it("defaults to disabled", () => {
    expect(readKioskEnabled(undefined)).toBe(false);
    expect(readKioskEnabled({})).toBe(false);
    expect(readKioskEnabled({ kioskEnabled: false })).toBe(false);
    expect(readKioskEnabled({ kioskEnabled: "true" })).toBe(false);
  });

  it("reads true only for boolean true", () => {
    expect(readKioskEnabled({ kioskEnabled: true })).toBe(true);
  });

  it("writeKioskEnabled toggles the flag without dropping other keys", () => {
    const base: Record<string, unknown> = { playlist: ["a"], hostEmail: "h@x.com" };
    const on = writeKioskEnabled(base, true);
    expect(on.kioskEnabled).toBe(true);
    expect(on.playlist).toEqual(["a"]);
    expect(base.kioskEnabled).toBeUndefined();

    const off = writeKioskEnabled(on, false);
    expect(off.kioskEnabled).toBeUndefined();
    expect(off.playlist).toEqual(["a"]);
  });
});
