import { describe, it, expect } from "vitest";
import {
  applyEventPatch,
  parseSessionKind,
  readSessionEvent,
  writeSessionEvent,
} from "./sessionEvent.js";

describe("sessionEvent", () => {
  it("defaults to exploration with no schedule", () => {
    expect(readSessionEvent({})).toEqual({
      kind: "exploration",
      startsAt: null,
      endsAt: null,
    });
    expect(parseSessionKind("event")).toBe("event");
    expect(parseSessionKind("nope")).toBeNull();
  });

  it("writeSessionEvent omits exploration kind", () => {
    const meta = writeSessionEvent(
      { playlist: ["a"] },
      { kind: "event", startsAt: "2026-09-01T15:00:00.000Z", endsAt: null },
    );
    expect(meta.kind).toBe("event");
    expect(meta.startsAt).toBe("2026-09-01T15:00:00.000Z");
    expect(meta.playlist).toEqual(["a"]);

    const cleared = writeSessionEvent(meta, {
      kind: "exploration",
      startsAt: null,
      endsAt: null,
    });
    expect(cleared.kind).toBeUndefined();
    expect(cleared.startsAt).toBeUndefined();
  });

  it("applyEventPatch validates kind and schedule order", () => {
    const badKind = applyEventPatch({}, { kind: "party" });
    expect(badKind.ok).toBe(false);

    const badOrder = applyEventPatch(
      {},
      {
        kind: "event",
        startsAt: "2026-09-02T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
      },
    );
    expect(badOrder.ok).toBe(false);

    const ok = applyEventPatch({}, { kind: "event", startsAt: "2026-09-01T12:00:00Z" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.metadata.kind).toBe("event");
      expect(typeof ok.metadata.startsAt).toBe("string");
    }
  });
});
