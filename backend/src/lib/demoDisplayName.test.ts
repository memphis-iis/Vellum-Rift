import { describe, it, expect } from "vitest";
import { formatDemoDisplayName } from "./demoCatalog.js";

describe("formatDemoDisplayName", () => {
  it("humanizes underscore labels", () => {
    expect(formatDemoDisplayName("Declaration_of_Independence_-_Jefferson_Handwriting")).toBe(
      "Declaration of Independence - Jefferson Handwriting",
    );
  });
  it("keeps readable titles", () => {
    expect(formatDemoDisplayName("Jefferson Notes")).toBe("Jefferson Notes");
  });
});
