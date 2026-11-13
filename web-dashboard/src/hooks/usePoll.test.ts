import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapWithLimit } from "../lib/concurrency";
import { nextPollDelay, startPoller } from "./usePoll";

describe("nextPollDelay", () => {
  it("doubles per failure and caps", () => {
    expect(nextPollDelay(1000, 0, 30_000)).toBe(1000);
    expect(nextPollDelay(1000, 3, 30_000)).toBe(8000);
    expect(nextPollDelay(1000, 20, 30_000)).toBe(30_000);
  });
});

describe("startPoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stops after maxAttempts and reports give up", async () => {
    const task = vi.fn().mockResolvedValue("continue");
    const onGiveUp = vi.fn();
    startPoller(task, { intervalMs: 10, maxAttempts: 3 }, () => ({ onGiveUp }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledOnce();
  });

  it("stops when the task returns stop", async () => {
    const task = vi.fn().mockResolvedValue("stop");
    startPoller(task, { intervalMs: 10, maxAttempts: 50 }, () => ({}));
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("backs off on failure and reports errors", async () => {
    const task = vi.fn().mockRejectedValue(new Error("x"));
    const onError = vi.fn();
    startPoller(task, { intervalMs: 100, maxAttempts: 10 }, () => ({ onError }));
    await vi.advanceTimersByTimeAsync(100); // run 1
    await vi.advanceTimersByTimeAsync(150); // next due at +200, not yet
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("aborts the signal and halts on stop()", async () => {
    let signal: AbortSignal | undefined;
    const task = vi.fn(async (s: AbortSignal) => {
      signal = s;
    });
    const stop = startPoller(task, { intervalMs: 10, maxAttempts: 50 }, () => ({}));
    await vi.advanceTimersByTimeAsync(15);
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(task).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
  });

  it("pauses while hidden and resumes on visible", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const task = vi.fn().mockResolvedValue("continue");
    startPoller(task, { intervalMs: 10, maxAttempts: 50 }, () => ({}));
    await vi.advanceTimersByTimeAsync(100);
    expect(task).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5);
    expect(task).toHaveBeenCalled();
    hidden.mockRestore();
  });
});

describe("mapWithLimit", () => {
  it("never exceeds the concurrency limit and keeps order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
