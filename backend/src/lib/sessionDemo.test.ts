import { describe, expect, it } from "vitest";
import {
  applyDemoPatch,
  DEFAULT_DEMO_CATEGORY,
  readSessionDemo,
  writeSessionDemo,
} from "./sessionDemo.js";

describe("sessionDemo", () => {
  it("defaults disabled with Examples category", () => {
    expect(readSessionDemo({})).toEqual({
      enabled: false,
      category: DEFAULT_DEMO_CATEGORY,
      summary: "",
    });
  });

  it("write/read round-trip", () => {
    const meta = writeSessionDemo(
      {},
      { enabled: true, category: "Medieval", summary: "Codex study" },
    );
    expect(readSessionDemo(meta)).toEqual({
      enabled: true,
      category: "Medieval",
      summary: "Codex study",
    });
  });

  it("disabling clears demo keys", () => {
    const on = writeSessionDemo(
      {},
      { enabled: true, category: "A", summary: "B" },
    );
    const off = writeSessionDemo(on, {
      enabled: false,
      category: "A",
      summary: "B",
    });
    expect(off.demoEnabled).toBeUndefined();
    expect(off.demoCategory).toBeUndefined();
    expect(off.demoSummary).toBeUndefined();
  });

  it("enable requires playlist and turns kiosk on", () => {
    const bad = applyDemoPatch({}, { enabled: true, category: "Forgery" });
    expect(bad.ok).toBe(false);

    const good = applyDemoPatch(
      { playlist: ["model-a"] },
      { enabled: true, category: "Forgery", summary: "Compare hands" },
    );
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.metadata.demoEnabled).toBe(true);
    expect(good.metadata.demoCategory).toBe("Forgery");
    expect(good.metadata.kioskEnabled).toBe(true);
  });
});
