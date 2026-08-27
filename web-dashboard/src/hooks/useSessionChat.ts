import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  createSession,
  fetchChat,
  getSession,
  postChat,
  type ChatMessage,
  type GameSession,
  type PlayerState,
} from "../api/gameState";

const POLL_INTERVAL_MS = 2000;

interface LocalIdentity {
  playerId: string;
  displayName: string;
  isHost: boolean;
}

/**
 * Owns the lifecycle for a single demo chat session:
 * create/join a session, keep it refreshed by polling, and read/write chat.
 *
 * The FTR-004 MVP uses lightweight HTTP polling until the WebRTC/presence
 * channel (IMPL-012/014) replaces it for realtime fan-out. The same
 * component/hook contract survives that swap because it is isolated here.
 */
export function useSessionChat() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<LocalIdentity | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const meRef = useRef<LocalIdentity | null>(null);
  meRef.current = me;

  const joinSession = useCallback(
    async (displayName: string) => {
      setStatus("connecting");
      setError(null);

      try {
        // MVP: create a fresh session for each host. Later this becomes
        // session browsing/entry from the dashboard (IMPL-015).
        const created = await createSession("Keyboard chat space");
        const player = await addPlayer(created.sessionId, displayName, true);

        // Backfill a second participant so the spatial room + bubbles have
        // someone to render against. Real participant presence replaces this.
        await addPlayer(created.sessionId, "Learner", false).catch(() => {
          /* optional second participant, not fatal */
        });

        setSession(await getSession(created.sessionId));
        setMe({ playerId: player.id, displayName, isHost: true });
        setMessages(await fetchChat(created.sessionId));
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to join space");
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const identity = meRef.current;
      if (!trimmed || !session || !identity) return;

      try {
        const message = await postChat(
          session.sessionId,
          identity.playerId,
          trimmed,
        );
        setMessages((prev) => [...prev, message]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      }
    },
    [session],
  );

  // Poll the session for new messages and presence while active.
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const [nextSession, nextMessages] = await Promise.all([
          getSession(session.sessionId),
          fetchChat(session.sessionId),
        ]);
        if (cancelled) return;
        setSession(nextSession);
        setMessages(nextMessages);
      } catch {
        // Polling is best-effort; a dropped tick is retried next interval.
      }
    };

    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.sessionId]);

  return { session, messages, me, status, error, joinSession, sendMessage };
}

export type { LocalIdentity, PlayerState };