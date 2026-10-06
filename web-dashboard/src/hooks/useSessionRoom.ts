import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  fetchChat,
  getSession,
  postChat,
  removePlayer,
  type ChatMessage,
  type GameSession,
  type PlayerState,
} from "../api/gameState";
import { CHAT_ENABLED } from "../auth/config";
import { useAuth } from "../auth/AuthContext";

const POLL_INTERVAL_MS = 2000;
const PLAYER_ID_PREFIX = "vellum_rift_player:";

function playerIdStorageKey(sessionId: string): string {
  return `${PLAYER_ID_PREFIX}${sessionId}`;
}

function readStoredPlayerId(sessionId: string): string | null {
  try {
    return sessionStorage.getItem(playerIdStorageKey(sessionId));
  } catch {
    return null;
  }
}

function writeStoredPlayerId(sessionId: string, playerId: string): void {
  try {
    sessionStorage.setItem(playerIdStorageKey(sessionId), playerId);
  } catch {
    /* ignore */
  }
}

function normalizeEmail(input: string | null | undefined): string {
  return String(input || "").trim().toLowerCase();
}

function sessionUpdatedMs(session: GameSession | null | undefined): number {
  if (!session?.updatedAt) return 0;
  const t = Date.parse(session.updatedAt);
  return Number.isNaN(t) ? 0 : t;
}

/** Lobby Host tools: player.isHost OR durable Space creator match. */
function resolveIsHost(
  player: Pick<PlayerState, "isHost"> | null | undefined,
  session: GameSession | null | undefined,
  userEmail: string | null | undefined,
  userSub: string | null | undefined,
): boolean {
  if (player?.isHost) return true;
  if (!session) return false;
  if (userSub && session.createdBySub && userSub === session.createdBySub) return true;
  const email = normalizeEmail(userEmail);
  if (email && normalizeEmail(session.createdByEmail) === email) return true;
  return false;
}

export type LocalIdentity = {
  playerId: string;
  displayName: string;
  isHost: boolean;
};

export type SessionRoomStatus = "idle" | "connecting" | "ready" | "error";

/**
 * Join an existing learning space for the Enter / Space room lobby:
 * add the local player, poll presence + chat, send messages.
 */
export function useSessionRoom(sessionId: string | null, displayName: string) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  const userSub = user?.sub ?? null;
  const [session, setSession] = useState<GameSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<LocalIdentity | null>(null);
  const [status, setStatus] = useState<SessionRoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  /** Host mutations bump this so an in-flight poll cannot overwrite newer state. */
  const [mutationEpoch, setMutationEpoch] = useState(0);
  const pollPausedRef = useRef(false);
  const sessionRef = useRef<GameSession | null>(null);
  const joinInFlightRef = useRef(false);

  const meRef = useRef<LocalIdentity | null>(null);
  meRef.current = me;
  sessionRef.current = session;

  const applySession = useCallback((next: GameSession | null) => {
    if (!next) {
      setSession(null);
      return;
    }
    setSession((prev) => {
      if (!prev) return next;
      if (sessionUpdatedMs(next) < sessionUpdatedMs(prev)) return prev;
      return next;
    });
    setMutationEpoch((n) => n + 1);
  }, []);

  const setPlaylistBusy = useCallback((busy: boolean) => {
    pollPausedRef.current = busy;
  }, []);

  const join = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setMe(null);
      setStatus("idle");
      setError(null);
      return;
    }

    if (joinInFlightRef.current) return;
    joinInFlightRef.current = true;

    const name = displayName.trim() || "Learner";
    setStatus("connecting");
    setError(null);
    setMe(null);
    setMessages([]);
    setSession(null);

    try {
      const existing = await getSession(sessionId);
      if (!existing.isActive) {
        throw new Error("This space is archived. Restore it from Spaces first.");
      }

      const creatorHost =
        Boolean(userSub && existing.createdBySub && userSub === existing.createdBySub) ||
        Boolean(
          normalizeEmail(userEmail) &&
            normalizeEmail(existing.createdByEmail) === normalizeEmail(userEmail),
        );
      const adoptHost = !existing.hostId || creatorHost;
      const storedId = readStoredPlayerId(sessionId);
      const player = await addPlayer(sessionId, name, adoptHost, storedId);
      writeStoredPlayerId(sessionId, player.id);
      const refreshed = await getSession(sessionId);
      setSession(refreshed);
      setMe({
        playerId: player.id,
        displayName: player.displayName || name,
        isHost: resolveIsHost(player, refreshed, userEmail, userSub),
      });
      setMessages(CHAT_ENABLED ? await fetchChat(sessionId) : []);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to join space");
    } finally {
      joinInFlightRef.current = false;
    }
  }, [sessionId, displayName, userEmail, userSub]);

  useEffect(() => {
    void join();
    return () => {
      if (!sessionId) return;
      const id = meRef.current?.playerId ?? readStoredPlayerId(sessionId);
      if (!id) return;
      void removePlayer(sessionId, id).catch(() => {
        /* best-effort leave */
      });
    };
  }, [join, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const identity = meRef.current;
      if (!CHAT_ENABLED || !trimmed || !session || !identity) return;

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
      if (pollPausedRef.current) return;
      try {
        const knownMs = sessionUpdatedMs(sessionRef.current);
        const nextSession = await getSession(session.sessionId);
        const nextMessages = CHAT_ENABLED
          ? await fetchChat(session.sessionId)
          : [];
        if (cancelled || pollPausedRef.current) return;
        if (sessionUpdatedMs(nextSession) < knownMs) return;
        setSession(nextSession);
        setMessages(nextMessages);
        const self = nextSession.players?.find((p) => p.id === meRef.current?.playerId);
        if (self && meRef.current) {
          setMe({
            playerId: self.id,
            displayName: self.displayName || meRef.current.displayName,
            isHost: resolveIsHost(self, nextSession, userEmail, userSub),
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
  }, [session?.sessionId, status, userEmail, userSub, mutationEpoch]);

  return {
    session,
    messages,
    me,
    status,
    error,
    sendMessage,
    retry: join,
    applySession,
    setPlaylistBusy,
    players: (session?.players ?? []) as PlayerState[],
  };
}
