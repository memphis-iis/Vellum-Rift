import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../api/gameState";
import type { LocalIdentity } from "../hooks/useSessionChat";
import PlayerAvatar from "./PlayerAvatar";

interface ChatPanelProps {
  /** Null means the user has not joined a session yet. */
  me: LocalIdentity | null;
  messages: ChatMessage[];
  status: "idle" | "connecting" | "ready" | "error";
  error: string | null;
  onJoin: (displayName: string) => void;
  onSend: (text: string) => void;
}

/**
 * FTR-004 MVP: desktop text chat input + history panel anchored to the
 * lower-right corner. This is the keyboard-communication surface for users
 * without a mic or VR headset.
 */
export default function ChatPanel({
  me,
  messages,
  status,
  error,
  onJoin,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, me, scrollToBottom]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    onJoin(name);
    setNameDraft("");
  };

  const latest = messages.slice(-50);

  return (
    <aside className="chat-panel" aria-label="Team chat">
      <header className="chat-panel__header">
        <div>
          <p className="chat-panel__eyebrow">Team communication</p>
          <h2>Text chat</h2>
        </div>
        {me && (
          <span className="chat-panel__presence" aria-live="polite">
            {status === "connecting" ? "Joining…" : "Connected"}
          </span>
        )}
      </header>

      {!me ? (
        <form className="chat-panel__join" onSubmit={handleJoin}>
          <label htmlFor="chat-display-name">Display name</label>
          <input
            id="chat-display-name"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="e.g. Scribe"
            maxLength={40}
            autoComplete="off"
          />
          <button type="submit" disabled={status === "connecting" || !nameDraft.trim()}>
            {status === "connecting" ? "Joining space…" : "Join space"}
          </button>
          {status === "error" && error && (
            <p className="chat-panel__error">{error}</p>
          )}
        </form>
      ) : (
        <>
          <div
            className="chat-panel__history"
            ref={historyRef}
            aria-live="polite"
            role="log"
          >
            {latest.length === 0 ? (
              <p className="chat-panel__empty">
                No messages yet. Say hello to the room.
              </p>
            ) : (
              latest.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  isMine={message.playerId === me.playerId}
                />
              ))
            )}
          </div>

          <form className="chat-panel__composer" onSubmit={handleSubmit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a message…"
              aria-label="Chat message"
              maxLength={1000}
              autoComplete="off"
            />
            <button type="submit" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      {me && error && <p className="chat-panel__error">{error}</p>}
    </aside>
  );
}

function MessageRow({
  message,
  isMine,
}: {
  message: ChatMessage;
  isMine: boolean;
}) {
  const time = new Date(message.sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Server-generated notices (e.g. "Player joined the session") render as a
  // centered system line without an avatar or author prefix.
  if (message.system) {
    return (
      <div className="chat-message chat-message--system">
        <div className="chat-message__body">
          <p className="chat-message__system-text">{message.text}</p>
          <p className="chat-message__time">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-message${isMine ? " chat-message--mine" : ""}`}>
      {!isMine && <PlayerAvatar playerId={message.playerId} label={message.displayName} size={30} />}
      <div className="chat-message__body">
        <p className="chat-message__meta">
          <span className="chat-message__author">
            {isMine ? "You" : message.displayName}
          </span>
          <span className="chat-message__time">{time}</span>
        </p>
        <p className="chat-message__text">{message.text}</p>
      </div>
    </div>
  );
}
