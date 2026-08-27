import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  fetchChat,
  getSession,
  postChat,
  type ChatMessage,
  type GameSession,
  type PlayerState,
} from "../api/gameState";

const POLL_INTERVAL_MS = 2000;

export type LocalIdentity = {
  playerId: string;
  displayName: string;
  isHost: boolean;
};

export type SessionRoomStatus = "idle" | "connecting" | "ready" | "error";

/**
 * Join an existing exploration session for the Enter / Session Room lobby:
 * add the local player, poll presence + chat, send messages.
 */
export function useSessionRoom(sessionId: string | null, displayName: string) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<LocalIdentity | null>(null);
  const [status, setStatus] = useState<SessionRoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const meRef = useRef<LocalIdentity | null>(null);
  meRef.current = me;

  const join = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setMe(null);
      setStatus("idle");
      setError(null);
      return;
    }

    const name = displayName.trim() || "Explorer";
    setStatus("connecting");
    setError(null);
    setMe(null);
    setMessages([]);
    setSession(null);

    try {
      const existing = await getSession(sessionId);
      if (!existing.isActive) {
        throw new Error("This session is archived. Restore it from Sessions first.");
      }

      const adoptHost = !existing.hostId;
      const player = await addPlayer(sessionId, name, adoptHost);
      const refreshed = await getSession(sessionId);
      setSession(refreshed);
      setMe({
        playerId: player.id,
        displayName: player.displayName || name,
        isHost: player.isHost,
      });
      setMessages(await fetchChat(sessionId));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to join session");
    }
  }, [sessionId, displayName]);

  useEffect(() => {
    void join();
  }, [join]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const identity = meRef.current;
      if (!trimmed || !session || !identity) return;

      try {
        const message = await postChat(session.sessionId, identity.playerId, trimmed);
        setMessages((prev) => [...prev, message]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      }
    },
    [session],
  );

  useEffect(() => {
    if (!session?.sessionId || status !== "ready") return;

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
        const self = nextSession.players?.find((p) => p.id === meRef.current?.playerId);
        if (self && meRef.current) {
          setMe({
            playerId: self.id,
            displayName: self.displayName || meRef.current.displayName,
            isHost: self.isHost,
          });
        }
      } catch {
        /* best-effort poll */
      }
    };

    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.sessionId, status]);

  return {
    session,
    messages,
    me,
    status,
    error,
    sendMessage,
    retry: join,
    players: (session?.players ?? []) as PlayerState[],
  };
}
