import { describe, expect, it, afterEach } from "vitest";
import { isChatEnabled } from "./chatEnabled.js";

describe("isChatEnabled", () => {
  const previous = process.env.CHAT_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.CHAT_ENABLED;
    else process.env.CHAT_ENABLED = previous;
  });

  it("defaults to enabled when unset", () => {
    delete process.env.CHAT_ENABLED;
    expect(isChatEnabled()).toBe(true);
  });

  it("is enabled when CHAT_ENABLED=true", () => {
    process.env.CHAT_ENABLED = "true";
    expect(isChatEnabled()).toBe(true);
  });

  it("is disabled only when CHAT_ENABLED=false", () => {
    process.env.CHAT_ENABLED = "false";
    expect(isChatEnabled()).toBe(false);
  });
});
