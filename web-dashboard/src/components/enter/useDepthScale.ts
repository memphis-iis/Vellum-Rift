import { useEffect, useState } from "react";
import type { GameSession } from "../../api/gameState";
import { patchSessionDepthScale } from "../../api/sessions";
import { readDepthScale } from "./helpers";

type DepthContext = {
  sessionId: string | null;
  isHost: boolean;
  session: GameSession | null;
  applySession: (session: GameSession) => void;
};

/** Debounced host-controlled Z relief slider. */
export function useDepthScale({ sessionId, isHost, session, applySession }: DepthContext) {
  const sessionDepth = readDepthScale(session);
  const [draft, setDraft] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) setDraft(sessionDepth);
  }, [sessionDepth, session?.sessionId, busy]);

  useEffect(() => {
    if (!sessionId || !isHost) return;
    if (Math.abs(draft - sessionDepth) < 0.001) return;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      patchSessionDepthScale(sessionId, draft)
        .then((updated) => applySession(updated as GameSession))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Depth update failed");
          setDraft(sessionDepth);
        })
        .finally(() => setBusy(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, sessionId, isHost, sessionDepth, applySession]);

  return { draft, setDraft, busy, error };
}

export type DepthState = ReturnType<typeof useDepthScale>;
