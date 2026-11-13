import { describe, it, expect } from "vitest";
import {
  readExhibitModelId,
  readExhibitReadonly,
  writeExhibitFlags,
} from "./sessionExhibit.js";

describe("sessionExhibit", () => {
  it("writeExhibitFlags sets readonly + model id", () => {
    const next = writeExhibitFlags({ kioskEnabled: true }, "model-1");
    expect(readExhibitReadonly(next)).toBe(true);
    expect(readExhibitModelId(next)).toBe("model-1");
    expect(next.kioskEnabled).toBe(true);
  });

  it("read helpers treat missing as off", () => {
    expect(readExhibitReadonly({})).toBe(false);
    expect(readExhibitModelId({})).toBeNull();
  });
});
