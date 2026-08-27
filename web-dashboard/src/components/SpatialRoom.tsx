import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, GameSession } from "../api/gameState";
import PlayerAvatar from "./PlayerAvatar";

interface SpatialRoomProps {
  session: GameSession | null;
  messages: ChatMessage[];
  meId: string | null;
}

const BUBBLE_TTL_MS = 5000;

/**
 * FTR-004 MVP: a simplified top-down spatial view. Each participant is drawn
 * as placeholder avatar art, and their most recent chat message is rendered as
 * a text bubble over their head. This mirrors the VR experience where chat
 * appears above the speaker without requiring a headset.
 */
export default function SpatialRoom({
  session,
  messages,
  meId,
}: SpatialRoomProps) {
  // The latest message shown above each player, with a TTL so bubbles fade.
  const [now, setNow] = useState(() => Date.now());

  // Advance the clock so expired bubbles fade automatically rather than
  // remaining until the next poll-triggered re-render.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleAfter = now - BUBBLE_TTL_MS;

  const latestByPlayer = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) {
      // System notices (e.g. join messages) have no player and never bubble.
      if (message.system || !message.playerId) continue;
      map.set(message.playerId, message);
    }
    return map;
  }, [messages]);

  const players = session?.players ?? [];

  return (
    <section className="spatial-room" aria-label="Spatial space view">
      <header className="spatial-room__header">
        <p>Shared space</p>
        <h2>Spatial room</h2>
        <span className="spatial-room__count">
          {players.length} participant{players.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="spatial-room__refresh"
          onClick={() => setNow(Date.now())}
        >
          Clear bubbles
        </button>
      </header>

      {players.length === 0 ? (
        <p className="spatial-room__empty">
          Join a space above to see participants appear here.
        </p>
      ) : (
        <div className="spatial-room__floor">
          {players.map((player, index) => {
            const bubble = latestByPlayer.get(player.id);
            const bubbleVisible =
              bubble != null && new Date(bubble.sentAt).getTime() >= visibleAfter;

            return (
              <div
                key={player.id}
                className="spatial-player"
                style={{ left: `${15 + ((index * 37) % 70)}%`, top: `${25 + ((index * 23) % 50)}%` }}
              >
                {bubbleVisible && bubble && (
                  <div className="spatial-player__bubble">
                    <span className="spatial-player__bubble-author">
                      {player.id === meId ? "You" : player.displayName}
                    </span>
                    {bubble.text}
                  </div>
                )}
                <div
                  className={`spatial-player__body${
                    player.id === meId ? " spatial-player__body--me" : ""
                  }`}
                >
                  <PlayerAvatar playerId={player.id} label={player.displayName} size={56} />
                  <span className="spatial-player__name">
                    {player.displayName}
                    {player.isHost ? " (host)" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}