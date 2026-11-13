import { useEffect, useRef } from "react";

export type PollResult = "continue" | "stop";

export type PollOptions = {
  intervalMs: number;
  /** Hard upper bound on task runs; polling gives up afterwards. */
  maxAttempts: number;
  maxBackoffMs?: number;
  enabled?: boolean;
  /** Run the task immediately instead of waiting one interval. */
  immediate?: boolean;
  /** Changing this value restarts the poller and resets the attempt budget. */
  resetKey?: string | number;
  onError?: (error: unknown, consecutiveFailures: number) => void;
  onGiveUp?: () => void;
};

export type PollTask = (signal: AbortSignal) => Promise<PollResult | void>;

const DEFAULT_MAX_BACKOFF_MS = 30_000;
const MAX_FAILURE_EXPONENT = 6;

/** Delay before the next run: interval doubled per consecutive failure, capped. */
export function nextPollDelay(
  intervalMs: number,
  failures: number,
  maxBackoffMs: number,
): number {
  const exponent = Math.min(failures, MAX_FAILURE_EXPONENT);
  return Math.min(maxBackoffMs, intervalMs * 2 ** exponent);
}

type Handlers = Pick<PollOptions, "onError" | "onGiveUp">;

/**
 * Start a single-timer, bounded poller. Returns a stop function.
 * Pauses while the tab is hidden and resumes when visible again.
 */
export function startPoller(
  task: PollTask,
  options: Pick<PollOptions, "intervalMs" | "maxAttempts" | "maxBackoffMs" | "immediate">,
  handlers: () => Handlers,
): () => void {
  const ctrl = new AbortController();
  const maxBackoff = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  let attempts = 0;
  let failures = 0;
  let parked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay: number): void => {
    if (ctrl.signal.aborted) return;
    timer = setTimeout(() => void run(), delay);
  };

  const run = async (): Promise<void> => {
    if (ctrl.signal.aborted) return;
    if (document.hidden) {
      parked = true;
      return;
    }
    attempts += 1;
    let result: PollResult | void = undefined;
    try {
      result = await task(ctrl.signal);
      failures = 0;
    } catch (error) {
      if (ctrl.signal.aborted) return;
      failures += 1;
      handlers().onError?.(error, failures);
    }
    if (ctrl.signal.aborted || result === "stop") return;
    if (attempts >= options.maxAttempts) {
      handlers().onGiveUp?.();
      return;
    }
    schedule(nextPollDelay(options.intervalMs, failures, maxBackoff));
  };

  const onVisibility = (): void => {
    if (!document.hidden && parked) {
      parked = false;
      schedule(0);
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  schedule(options.immediate ? 0 : options.intervalMs);

  return () => {
    ctrl.abort();
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Bounded, backoff-aware, visibility-aware polling with abort on unmount. */
export function usePoll(task: PollTask, options: PollOptions): void {
  const taskRef = useRef(task);
  const handlersRef = useRef<Handlers>({});
  taskRef.current = task;
  handlersRef.current = { onError: options.onError, onGiveUp: options.onGiveUp };

  const { enabled = true, intervalMs, maxAttempts, maxBackoffMs, immediate, resetKey } = options;

  useEffect(() => {
    if (!enabled) return;
    return startPoller(
      (signal) => taskRef.current(signal),
      { intervalMs, maxAttempts, maxBackoffMs, immediate },
      () => handlersRef.current,
    );
  }, [enabled, intervalMs, maxAttempts, maxBackoffMs, immediate, resetKey]);
}
