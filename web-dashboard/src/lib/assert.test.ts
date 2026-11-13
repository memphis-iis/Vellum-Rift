import { describe, expect, it } from "vitest";
import { assertId } from "./assert";
import { fetchJob } from "../api/upload";
import { getSession } from "../api/gameState";

describe("assertId", () => {
  it("accepts non-empty strings", () => {
    expect(() => assertId("abc", "id")).not.toThrow();
  });

  it.each(["", "   ", undefined, null, 5])("rejects %p", (value) => {
    expect(() => assertId(value, "sessionId")).toThrow(/Invalid sessionId/);
  });
});

describe("api preconditions", () => {
  it("fail before any network call", async () => {
    await expect(fetchJob("")).rejects.toThrow(/Invalid jobId/);
    expect(() => getSession(" ")).toThrow(/Invalid sessionId/);
  });
});
