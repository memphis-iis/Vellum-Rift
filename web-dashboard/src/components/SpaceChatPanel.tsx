import type { FormEvent } from "react";
import type { ChatMessage } from "../api/gameState";
import type { LocalIdentity, SessionRoomStatus } from "../hooks/useSessionRoom";
import { MaterialIcon } from "./MaterialIcon";

function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type SpaceChatPanelProps = {
  messages: ChatMessage[];
  me: LocalIdentity | null;
  status: SessionRoomStatus;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  className?: string;
  title?: string;
};

/**
 * Shared space chat rail — lobby Enter and embedded WebGL 3D (#157).
 */
export function SpaceChatPanel({
  messages,
  me,
  status,
  draft,
  onDraftChange,
  onSubmit,
  className = "vr-enter__chat glass-panel",
  title = "Space chat",
}: SpaceChatPanelProps) {
  return (
    <aside className={className} aria-label="Space chat">
      <div className="vr-enter__chat-head">
        <MaterialIcon name="forum" />
        <h3>{title}</h3>
      </div>
      <div className="vr-enter__chat-log">
        {messages.length === 0 ? (
          <p className="vr-enter__chat-empty">No messages yet. Say hello to the room.</p>
        ) : (
          messages.map((m) => {
            const mine = m.playerId === me?.playerId;
            return (
              <div
                key={m.id}
                className={`vr-enter__bubble-wrap${mine ? " vr-enter__bubble-wrap--mine" : ""}`}
              >
                <span className="vr-enter__bubble-meta">
                  {formatTime(m.sentAt)}
                  {!mine && !m.system ? ` · ${m.displayName}` : ""}
                </span>
                <div
                  className={`vr-enter__bubble${mine ? " vr-enter__bubble--mine" : ""}${
                    m.system ? " vr-enter__bubble--system" : ""
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form className="vr-enter__chat-compose" onSubmit={onSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={me ? "Type a message…" : "Join the space to chat"}
          disabled={!me || status !== "ready"}
          maxLength={500}
          aria-label="Chat message"
        />
        <button type="submit" disabled={!me || status !== "ready" || !draft.trim()}>
          <MaterialIcon name="send" />
        </button>
      </form>
    </aside>
  );
}
