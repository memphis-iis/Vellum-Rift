import { useEffect, useRef, useState, type FormEvent } from "react";
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
  /** Collapse to a side tab with unread badge (WebGL shell). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onUnreadChange?: (count: number) => void;
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
  collapsible = false,
  defaultCollapsed = false,
  onUnreadChange,
}: SpaceChatPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const seenCountRef = useRef(messages.length);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!collapsible) return;
    if (!collapsed) {
      seenCountRef.current = messages.length;
      setUnread(0);
      onUnreadChange?.(0);
      return;
    }
    const mine = me?.playerId;
    let count = 0;
    for (let i = seenCountRef.current; i < messages.length; i++) {
      const m = messages[i];
      if (m && m.playerId !== mine) count++;
    }
    setUnread(count);
    onUnreadChange?.(count);
  }, [messages, collapsed, collapsible, me?.playerId, onUnreadChange]);

  const expand = () => {
    setCollapsed(false);
    seenCountRef.current = messages.length;
    setUnread(0);
    onUnreadChange?.(0);
  };

  const collapse = () => {
    seenCountRef.current = messages.length;
    setCollapsed(true);
    setUnread(0);
    onUnreadChange?.(0);
  };

  if (collapsible && collapsed) {
    return (
      <button
        type="button"
        className="vr-shell-tab vr-shell-tab--chat"
        onClick={expand}
        aria-label={unread ? `Open space chat (${unread} new)` : "Open space chat"}
      >
        <MaterialIcon name="forum" />
        {unread > 0 ? (
          <span className="vr-shell-tab__badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <aside
      className={`${className}${collapsible ? " vr-shell-panel--open" : ""}`}
      aria-label="Space chat"
    >
      <div className="vr-enter__chat-head">
        <MaterialIcon name="forum" />
        <h3>{title}</h3>
        {collapsible ? (
          <button
            type="button"
            className="vr-shell-panel__collapse"
            onClick={collapse}
            aria-label="Collapse chat"
          >
            <MaterialIcon name="chevron_right" />
          </button>
        ) : null}
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
