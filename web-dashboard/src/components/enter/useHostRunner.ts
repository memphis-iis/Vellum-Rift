import { useCallback, useState } from "react";

type RunnerContext = {
  sessionId: string | null;
  isHost: boolean;
  isMuseumPath: boolean;
};

type ActOptions = { museum?: boolean };

export type HostRunner = {
  busy: boolean;
  status: string | null;
  setStatus: (message: string | null) => void;
  /** Guarded host action: runs `fn`, shows the returned message or the error. */
  act: (
    failMessage: string,
    fn: (sessionId: string) => Promise<string | void>,
    options?: ActOptions,
  ) => Promise<void>;
};

export function useHostRunner({ sessionId, isHost, isMuseumPath }: RunnerContext): HostRunner {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const act = useCallback<HostRunner["act"]>(
    async (failMessage, fn, options) => {
      if (!sessionId || !isHost || busy) return;
      if (options?.museum && !isMuseumPath) return;
      setBusy(true);
      try {
        const message = await fn(sessionId);
        if (typeof message === "string") setStatus(message);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : failMessage);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, isHost, isMuseumPath, busy],
  );

  return { busy, status, setStatus, act };
}
